-- Anmeldung zu Events begrenzen, manuell schließen, Warteliste mit automatischem Nachrücken
--
--  1) events.max_participants (null = unbegrenzt) und events.registration_closed (vom Vorstand manuell
--     geschlossen, jederzeit wieder zu öffnen).
--  2) Kapazität: Ein Trigger vor jeder Anmeldung sperrt die Event-Zeile und zählt erst dann. Gleichzeitige
--     Anmeldungen zum selben Event laufen damit nacheinander; auch der letzte Platz geht nur einmal weg.
--  3) Die Kapazität darf nicht unter die Zahl der bestehenden Anmeldungen sinken (Entscheidung Vorstand
--     2026-11-08). Erhöhen geht jederzeit.
--  4) Warteliste public.event_waitlist. Eintragen nur über event_join(): Unter derselben Sperre wird
--     entschieden, ob ein Platz frei ist (→ angemeldet) oder nicht (→ Warteliste). Austragen per RLS.
--  5) Nachrücken automatisch, sobald ein Platz frei wird (Abmeldung, Kapazität erhöht, Anmeldung wieder
--     geöffnet), aber nur solange die Anmeldung offen ist: nicht manuell geschlossen und bis einschließlich
--     Starttag (Berlin), wie die Anmelde-Policy. Die nachgerückte Person bekommt eine Mail
--     (notification_events, Typ event_waitlist_promoted).
--  6) Anmelde-Policy: zusätzlich nicht manuell geschlossen. Abmelden bleibt auch bei geschlossener
--     Anmeldung möglich (unverändert).
--
-- Rückwärtskompatibel: neue Spalten mit Default; bisheriger Code (direktes Insert in event_registrations)
-- läuft weiter und wird vom Kapazitäts-Trigger begrenzt.
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Spalten
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists max_participants integer;
alter table public.events add column if not exists registration_closed boolean not null default false;

alter table public.events drop constraint if exists events_max_participants_range;
alter table public.events add constraint events_max_participants_range
  check (max_participants is null or max_participants between 1 and 10000);

comment on column public.events.max_participants is
  'Max. Teilnehmende (null = unbegrenzt). Nicht kleiner als die Zahl der Anmeldungen (Trigger events_capacity_change).';
comment on column public.events.registration_closed is
  'Anmeldung vom Vorstand manuell geschlossen. Abmelden bleibt möglich, die Warteliste rückt nicht nach.';

-- ---------------------------------------------------------------------------
-- 4) Warteliste (vor den Funktionen, die sie verwenden)
-- ---------------------------------------------------------------------------
create table if not exists public.event_waitlist (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- clock_timestamp(): eindeutige Reihenfolge auch bei mehreren Einträgen in einer Transaktion.
  created_at timestamptz not null default clock_timestamp(),
  constraint event_waitlist_event_id_user_id_key unique (event_id, user_id)
);

comment on table public.event_waitlist is
  'Warteliste für ausgebuchte Events, Reihenfolge nach created_at. Eintragen nur über event_join().';

create index if not exists event_waitlist_event_order_idx on public.event_waitlist (event_id, created_at, id);
create index if not exists event_waitlist_user_id_idx on public.event_waitlist (user_id);

alter table public.event_waitlist enable row level security;
revoke all on public.event_waitlist from anon, authenticated;
grant select, delete on public.event_waitlist to authenticated;

drop policy if exists "event_waitlist: eigene lesen" on public.event_waitlist;
create policy "event_waitlist: eigene lesen" on public.event_waitlist
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "event_waitlist: selbst austragen" on public.event_waitlist;
create policy "event_waitlist: selbst austragen" on public.event_waitlist
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

-- ---------------------------------------------------------------------------
-- Mail-Typ für das Nachrücken
-- ---------------------------------------------------------------------------
alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check
  check (type in (
    'member_registered', 'member_cancelled', 'member_cancellation_confirmed', 'alumni_requested',
    'alumni_decided', 'event_announcement', 'event_waitlist_promoted', 'task_deadline', 'task_assigned',
    'iban_changed', 'test'
  ));

-- ---------------------------------------------------------------------------
-- 5) Nachrücken
-- ---------------------------------------------------------------------------
-- Besetzt freie Plätze der Reihe nach aus der Warteliste. Aufrufer: event_join() und die Trigger unten.
create or replace function public.event_fill_from_waitlist(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    record;
  v_next     record;
  v_profile  uuid;
  v_taken    integer;
  v_promoted integer := 0;
begin
  select e.id, e.title, e.event_date, e.end_date, e.event_time, e.end_time, e.location,
         coalesce(e.requires_registration, false) as requires_registration,
         e.registration_closed, e.max_participants
    into v_event
    from public.events e
   where e.id = p_event_id
     for update;

  -- Gelöschtes Event (Cascade), ohne Anmeldung, geschlossen oder nach dem Starttag: nichts tun.
  if not found
     or not v_event.requires_registration
     or v_event.registration_closed
     or v_event.event_date < (now() at time zone 'Europe/Berlin')::date then
    return 0;
  end if;

  loop
    if v_event.max_participants is not null then
      select count(*) into v_taken from public.event_registrations r where r.event_id = p_event_id;
      exit when v_taken >= v_event.max_participants;
    end if;

    select w.id, w.user_id
      into v_next
      from public.event_waitlist w
     where w.event_id = p_event_id
     order by w.created_at, w.id
     limit 1;
    exit when not found;

    delete from public.event_waitlist where id = v_next.id;

    -- Nur aktive Mitglieder rücken nach (gleiche Regel wie is_active_member()); andere fallen von der Liste.
    select p.id
      into v_profile
      from public.profiles p
     where p.user_id = v_next.user_id
       and lower(trim(coalesce(p."Status", ''))) not in ('cancelled', 'applicant')
     limit 1;
    continue when not found;

    insert into public.event_registrations (event_id, user_id)
    values (p_event_id, v_next.user_id)
    on conflict (event_id, user_id) do nothing;
    continue when not found;

    v_promoted := v_promoted + 1;
    insert into public.notification_events (type, profile_id, payload)
    values (
      'event_waitlist_promoted',
      v_profile,
      jsonb_build_object(
        'event_id', p_event_id,
        'user_id',  v_next.user_id,
        'event', jsonb_build_object(
          'title',      v_event.title,
          'event_date', v_event.event_date,
          'end_date',   v_event.end_date,
          'event_time', v_event.event_time,
          'end_time',   v_event.end_time,
          'location',   v_event.location
        )
      )
    );
  end loop;

  return v_promoted;
end;
$$;

revoke all on function public.event_fill_from_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.event_fill_from_waitlist(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2) Kapazität bei jeder Anmeldung
-- ---------------------------------------------------------------------------
create or replace function public.event_registrations_check_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  -- Event-Zeile sperren: Anmeldungen zu diesem Event laufen ab hier nacheinander.
  select e.max_participants into v_max from public.events e where e.id = new.event_id for update;
  if not found then
    return new; -- Fremdschlüssel meldet den Fehler
  end if;

  -- Doppelte Anmeldung: der Unique-Constraint meldet sie (23505), nicht "ausgebucht".
  if exists (
    select 1 from public.event_registrations r where r.event_id = new.event_id and r.user_id = new.user_id
  ) then
    return new;
  end if;

  if v_max is not null
     and (select count(*) from public.event_registrations r where r.event_id = new.event_id) >= v_max then
    raise exception 'event_full' using errcode = 'P0001';
  end if;

  -- Wer angemeldet ist, steht nicht mehr auf der Warteliste.
  delete from public.event_waitlist w where w.event_id = new.event_id and w.user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.event_registrations_check_capacity() from public, anon, authenticated;

drop trigger if exists event_registrations_capacity on public.event_registrations;
create trigger event_registrations_capacity
  before insert on public.event_registrations
  for each row execute function public.event_registrations_check_capacity();

-- Abmeldung → freien Platz aus der Warteliste besetzen.
create or replace function public.event_registrations_fill_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.event_fill_from_waitlist(old.event_id);
  return null;
end;
$$;

revoke all on function public.event_registrations_fill_after_delete() from public, anon, authenticated;

drop trigger if exists event_registrations_fill_waitlist on public.event_registrations;
create trigger event_registrations_fill_waitlist
  after delete on public.event_registrations
  for each row execute function public.event_registrations_fill_after_delete();

-- ---------------------------------------------------------------------------
-- 3) Kapazität nicht unter die Zahl der Anmeldungen
-- ---------------------------------------------------------------------------
create or replace function public.events_check_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.max_participants is not null
     and new.max_participants is distinct from old.max_participants
     and new.max_participants < (
       select count(*) from public.event_registrations r where r.event_id = new.id
     ) then
    raise exception 'capacity_below_registrations' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.events_check_capacity_change() from public, anon, authenticated;

drop trigger if exists events_capacity_change on public.events;
create trigger events_capacity_change
  before update of max_participants on public.events
  for each row execute function public.events_check_capacity_change();

-- Kapazität erhöht, wieder geöffnet, Anmeldung eingeschaltet oder Datum verschoben → nachrücken.
create or replace function public.events_fill_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.event_fill_from_waitlist(new.id);
  return null;
end;
$$;

revoke all on function public.events_fill_after_update() from public, anon, authenticated;

drop trigger if exists events_fill_waitlist on public.events;
create trigger events_fill_waitlist
  after update of max_participants, registration_closed, requires_registration, event_date on public.events
  for each row
  when (
    old.max_participants is distinct from new.max_participants
    or old.registration_closed is distinct from new.registration_closed
    or old.requires_registration is distinct from new.requires_registration
    or old.event_date is distinct from new.event_date
  )
  execute function public.events_fill_after_update();

-- ---------------------------------------------------------------------------
-- 4) Anmelden oder auf die Warteliste (Server Action → RPC mit der Sitzung des Mitglieds)
-- ---------------------------------------------------------------------------
-- Rückgabe: 'registered' oder 'waitlisted'. Fehler: not_allowed, event_not_found, registration_closed.
create or replace function public.event_join(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_event record;
  v_taken integer;
begin
  if v_uid is null or not public.is_active_member() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select e.id, coalesce(e.requires_registration, false) as requires_registration,
         e.registration_closed, e.event_date, e.max_participants
    into v_event
    from public.events e
   where e.id = p_event_id
     for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.event_registrations r where r.event_id = p_event_id and r.user_id = v_uid) then
    return 'registered';
  end if;
  if exists (select 1 from public.event_waitlist w where w.event_id = p_event_id and w.user_id = v_uid) then
    return 'waitlisted';
  end if;

  if not v_event.requires_registration
     or v_event.registration_closed
     or v_event.event_date < (now() at time zone 'Europe/Berlin')::date then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;

  -- Wer schon wartet, ist zuerst dran: freie Plätze vorher aus der Warteliste besetzen.
  perform public.event_fill_from_waitlist(p_event_id);

  select count(*) into v_taken from public.event_registrations r where r.event_id = p_event_id;
  if v_event.max_participants is null or v_taken < v_event.max_participants then
    insert into public.event_registrations (event_id, user_id) values (p_event_id, v_uid);
    return 'registered';
  end if;

  insert into public.event_waitlist (event_id, user_id) values (p_event_id, v_uid);
  return 'waitlisted';
end;
$$;

revoke all on function public.event_join(uuid) from public, anon;
grant execute on function public.event_join(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Anmelde-Policy: zusätzlich nicht manuell geschlossen
-- ---------------------------------------------------------------------------
drop policy if exists "event_registrations: selbst anmelden" on public.event_registrations;
create policy "event_registrations: selbst anmelden" on public.event_registrations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_member())
    and exists (
      select 1
        from public.events e
       where e.id = event_registrations.event_id
         and e.requires_registration
         and not e.registration_closed
         and e.event_date >= (now() at time zone 'Europe/Berlin')::date
    )
  );
