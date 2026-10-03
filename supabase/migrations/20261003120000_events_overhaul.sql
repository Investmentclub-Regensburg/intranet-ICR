-- Events überarbeiten
--
-- 1) Optionale Felder wirklich optional machen. description/location/organizer/event_time waren
--    NOT NULL, die App schickt bei leeren Feldern aber NULL → "violates not-null constraint"
--    beim Anlegen (u. a. sobald Beschreibung, Ort oder Startzeit leer blieben).
-- 2) end_time von text auf time umstellen (gleicher Typ wie event_time, DB validiert das Format).
-- 3) Schreibrechte auf events / Storage-Bucket event-images nur für admin/board
--    (Upload war bisher für jedes eingeloggte Mitglied offen).
-- 4) Event-Anmeldungen nur für Events mit Anmeldung, die noch nicht vorbei sind.
-- 5) Neuer Outbox-Typ event_announcement (Mail an Mitglieder über ein neues Event).
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: ist der aktuelle User admin oder board?
-- SECURITY INVOKER reicht: die Policy "Users can view own profile" erlaubt das Lesen der eigenen Zeile.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin_or_board()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p."Rolle" in ('admin', 'board')
      and lower(trim(coalesce(p."Status", ''))) <> 'cancelled'
  );
$$;

revoke execute on function public.is_admin_or_board() from public, anon;
grant execute on function public.is_admin_or_board() to authenticated;

-- ---------------------------------------------------------------------------
-- 1) + 2) Spalten
-- ---------------------------------------------------------------------------
alter table public.events
  alter column description drop not null,
  alter column location    drop not null,
  alter column organizer   drop not null,
  alter column event_time  drop not null,
  alter column created_by  set default auth.uid();

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'events' and column_name = 'end_time') = 'text' then
    alter table public.events
      alter column end_time type time using nullif(trim(end_time), '')::time;
  end if;
end $$;

comment on column public.events.end_time is
  'Endzeit (optional). Liegt sie vor event_time, endet das Event am Folgetag.';

alter table public.events drop constraint if exists events_title_not_blank;
alter table public.events add constraint events_title_not_blank check (length(trim(title)) > 0);

alter table public.events drop constraint if exists events_end_requires_start;
alter table public.events add constraint events_end_requires_start
  check (end_time is null or event_time is not null);

create index if not exists events_event_date_idx on public.events (event_date);

-- ---------------------------------------------------------------------------
-- 3) Policies events
-- ---------------------------------------------------------------------------
drop policy if exists "Nur Admins/Board dürfen Events erstellen" on public.events;
create policy "Nur Admins/Board dürfen Events erstellen"
  on public.events for insert to authenticated
  with check (public.is_admin_or_board());

drop policy if exists "Nur Admins/Board dürfen Events ändern" on public.events;
create policy "Nur Admins/Board dürfen Events ändern"
  on public.events for update to authenticated
  using (public.is_admin_or_board())
  with check (public.is_admin_or_board());

drop policy if exists "Nur Admins/Board dürfen Events löschen" on public.events;
create policy "Nur Admins/Board dürfen Events löschen"
  on public.events for delete to authenticated
  using (public.is_admin_or_board());

-- ---------------------------------------------------------------------------
-- 3) Storage-Bucket event-images
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
where id = 'event-images';

drop policy if exists "Admins dürfen Bilder hochladen" on storage.objects;
create policy "Admins dürfen Bilder hochladen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.is_admin_or_board());

drop policy if exists "Admins dürfen Bilder löschen" on storage.objects;
create policy "Admins dürfen Bilder löschen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and public.is_admin_or_board());

-- ---------------------------------------------------------------------------
-- 4) Anmeldungen nur für Events mit Anmeldung, die noch nicht vorbei sind
-- ---------------------------------------------------------------------------
drop policy if exists "User dürfen sich selbst anmelden" on public.event_registrations;
create policy "User dürfen sich selbst anmelden"
  on public.event_registrations for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.requires_registration
        and e.event_date >= (now() at time zone 'Europe/Berlin')::date
    )
  );

create index if not exists event_registrations_user_id_idx on public.event_registrations (user_id);

-- ---------------------------------------------------------------------------
-- 5) Outbox-Typ für Event-Ankündigungen
-- ---------------------------------------------------------------------------
alter table public.notification_events
  drop constraint if exists notification_events_type_check;
alter table public.notification_events
  add constraint notification_events_type_check
  check (type in (
    'member_registered', 'member_cancelled', 'alumni_requested', 'alumni_decided',
    'event_announcement', 'test'
  ));

create index if not exists notification_events_event_id_idx
  on public.notification_events ((payload->>'event_id'))
  where type = 'event_announcement';
