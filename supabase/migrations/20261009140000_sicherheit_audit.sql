-- Sicherheits-Audit vom 09.10.2026: Datenbank-Teil
--
-- Ersetzt die Entwürfe 20261008120000 (Profil-Verknüpfung nach Bestätigung),
-- 20261008120200 (Rechte auf profiles) und 20261008120300 (Anträge aus dem Profil).
--
--  1) Profile entstehen bzw. werden verknüpft erst mit bestätigter E-Mail-Adresse (M5).
--  2) profiles: kein Schreibrecht über die API, nur eigene Zeile lesbar, user_id eindeutig (N1).
--  3) is_active_member(): gekündigte Konten lesen und schreiben über die API nichts mehr (M1);
--     Event-Anmeldungen nur noch die eigenen lesbar (N2).
--  4) Gekündigte Konten werden in Supabase Auth gesperrt, bei Reaktivierung entsperrt (M1).
--  5) Alumni- und BVH-Anfragen: Stammdaten und Status aus dem Profil, nicht aus der Anfrage (M2).
--  6) IBAN-Änderungen: Zeitpunkt merken (Mandatsänderung im SEPA-Export) und Vorstand informieren (M3).
--  7) finance_exports: Protokoll jedes Finanzexports (wer, wann, wie viele Lastschriften).
--  8) Rate-Limit für Login und Passwort-vergessen (M4).
--  9) Rundmail an alle: Sperre und Eintrag in einem Schritt (N3).
-- 10) Bucket event-images: Auflisten nur für Admins/Vorstand; Bilder bleiben per URL öffentlich (N4).
--
-- Reihenfolge: zuerst die Edge Function notify-board deployen (kennt den Typ iban_changed),
-- dann diese Migration ausführen.
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Profil-Verknüpfung erst nach bestätigter E-Mail-Adresse
-- ---------------------------------------------------------------------------
-- Bisher hat handle_new_user() schon beim Anlegen des Kontos (vor der Bestätigung) ein
-- vorhandenes Profil gleicher Adresse übernommen. Neu:
--   * Ein bestehendes Profil wird erst verknüpft, wenn email_confirmed_at gesetzt wird.
--   * Ein neues Profil entsteht ebenfalls erst mit bestätigter Adresse (Status 'active').
--   * Ist die Adresse schon beim Anlegen bestätigt (vom Vorstand angelegtes Konto), wird nur für
--     unbekannte Adressen ein Profil angelegt; ein bestehendes Profil übernimmt dann niemand
--     automatisch.

create or replace function public.provision_profile_for_auth_user(p_user_id uuid, p_link_existing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u               auth.users%rowtype;
  meta            jsonb;
  birth_date      date;
  semester_number integer;
  sepa_confirmed  boolean;
begin
  select * into u from auth.users where id = p_user_id;
  if not found or u.email is null then
    return;
  end if;

  -- Konto ist bereits mit einem Profil verknüpft.
  if exists (select 1 from public.profiles p where p.user_id = u.id) then
    return;
  end if;

  -- Es gibt schon ein Profil mit dieser E-Mail-Adresse.
  if exists (select 1 from public.profiles p where lower(p."E-Mail") = lower(u.email)) then
    if p_link_existing then
      update public.profiles
         set user_id = u.id
       where id = (
         select p2.id
           from public.profiles p2
          where lower(p2."E-Mail") = lower(u.email)
            and p2.user_id is null
          order by p2.created_at nulls last, p2.id
          limit 1
       );
    end if;
    -- Kein zweites Profil mit derselben E-Mail-Adresse anlegen.
    return;
  end if;

  -- Neues Profil aus den Registrierungsdaten.
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb);

  if (meta->>'Geburtsdatum') ~ '^\d{4}-\d{2}-\d{2}$' then
    birth_date := (meta->>'Geburtsdatum')::date;
  end if;

  if (meta->>'Semester') ~ '^\d{1,2}$' then
    semester_number := (meta->>'Semester')::integer;
  end if;

  sepa_confirmed := lower(coalesce(meta->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');

  insert into public.profiles (
    "id", "user_id", "E-Mail", "Status", "Rolle", "Datum_Antrag",
    "Vorname", "Nachname", "Geburtsdatum", "Straße", "Hausnummer", "Ort", "PLZ",
    "Handynummer", "Studiengang / Fach", "Abschluss", "Semester", "Hochschulart",
    "IBAN", "BIC", "Sepa-Bestätigung"
  )
  values (
    u.id, u.id, u.email, 'active', 'member', current_date,
    left(meta->>'Vorname', 100),
    left(meta->>'Nachname', 100),
    birth_date,
    left(meta->>'Straße', 100),
    left(meta->>'Hausnr', 20),
    left(meta->>'Ort', 100),
    left(meta->>'PLZ', 10),
    left(meta->>'Handynummer', 40),
    left(meta->>'Fach', 150),
    left(meta->>'Abschluss', 150),
    semester_number,
    left(meta->>'Uni/OTH', 150),
    left(meta->>'IBAN', 34),
    left(meta->>'BIC', 11),
    sepa_confirmed
  );
end;
$$;

revoke execute on function public.provision_profile_for_auth_user(uuid, boolean) from public, anon, authenticated;

-- INSERT auf auth.users (bestehender Trigger on_auth_user_created ruft handle_new_user() auf).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    perform public.provision_profile_for_auth_user(new.id, false);
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- UPDATE auf auth.users: Adresse wurde bestätigt → Profil anlegen bzw. verknüpfen.
create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.provision_profile_for_auth_user(new.id, true);
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_confirmed() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  execute function public.handle_user_email_confirmed();

-- ---------------------------------------------------------------------------
-- 2) profiles: Rechte festschreiben, user_id eindeutig
-- ---------------------------------------------------------------------------
-- Mitglieder lesen nur die eigene Zeile (unabhängig vom Status, damit Login und Middleware
-- gekündigte Konten erkennen). Geschrieben wird nur per Service Role (Server Actions mit
-- Prüfung) und per Trigger.

alter table public.profiles enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', r.policyname);
  end loop;
end $$;

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;

create policy "profiles: eigene Zeile lesen"
  on public.profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  n integer;
begin
  select count(*) into n
    from (
      select user_id from public.profiles
       where user_id is not null
       group by user_id
      having count(*) > 1
    ) d;
  if n > 0 then
    raise exception 'profiles.user_id: % Konten sind mit mehreren Profilen verknüpft – vorher bereinigen', n;
  end if;
end $$;

create unique index if not exists profiles_user_id_key on public.profiles (user_id);

-- ---------------------------------------------------------------------------
-- 3) Nur aktive Mitglieder (inkl. Alumni) lesen und schreiben über die API
-- ---------------------------------------------------------------------------
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.user_id = auth.uid()
       and lower(trim(coalesce(p."Status", ''))) not in ('cancelled', 'applicant')
  );
$$;

revoke execute on function public.is_active_member() from public, anon;
grant execute on function public.is_active_member() to authenticated;

-- events
drop policy if exists "Jeder darf Events sehen" on public.events;
drop policy if exists "events: aktive Mitglieder lesen" on public.events;
create policy "events: aktive Mitglieder lesen"
  on public.events
  for select
  to authenticated
  using ((select public.is_active_member()));

-- news
drop policy if exists "Jeder eingeloggte User darf News lesen" on public.news;
drop policy if exists "news: aktive Mitglieder lesen" on public.news;
create policy "news: aktive Mitglieder lesen"
  on public.news
  for select
  to authenticated
  using ((select public.is_active_member()));

drop policy if exists "Nur Admins und Vorstände dürfen News erstellen" on public.news;
drop policy if exists "news: Admins und Vorstand erstellen" on public.news;
create policy "news: Admins und Vorstand erstellen"
  on public.news
  for insert
  to authenticated
  with check ((select public.is_admin_or_board()));

-- event_registrations: nur eigene Anmeldungen lesen (Teilnehmerlisten laufen per Service Role)
drop policy if exists "Jeder darf Anmeldungen sehen" on public.event_registrations;
drop policy if exists "event_registrations: eigene lesen" on public.event_registrations;
create policy "event_registrations: eigene lesen"
  on public.event_registrations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "User dürfen sich selbst anmelden" on public.event_registrations;
drop policy if exists "event_registrations: selbst anmelden" on public.event_registrations;
create policy "event_registrations: selbst anmelden"
  on public.event_registrations
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_active_member())
    and exists (
      select 1 from public.events e
       where e.id = event_registrations.event_id
         and e.requires_registration
         and e.event_date >= (now() at time zone 'Europe/Berlin')::date
    )
  );

drop policy if exists "User dürfen sich selbst abmelden" on public.event_registrations;
drop policy if exists "event_registrations: selbst abmelden" on public.event_registrations;
create policy "event_registrations: selbst abmelden"
  on public.event_registrations
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active_member()));

-- alumni_requests
drop policy if exists "Users can insert own alumni request" on public.alumni_requests;
create policy "Users can insert own alumni request"
  on public.alumni_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id and (select public.is_active_member()));

drop policy if exists "Admins can read all alumni requests" on public.alumni_requests;
create policy "Admins can read all alumni requests"
  on public.alumni_requests
  for select
  to authenticated
  using ((select public.is_admin_or_board()));

-- bvh_login_requests
drop policy if exists "Users can insert own bvh request" on public.bvh_login_requests;
create policy "Users can insert own bvh request"
  on public.bvh_login_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id and (select public.is_active_member()));

drop policy if exists "Users can read own bvh requests" on public.bvh_login_requests;
create policy "Users can read own bvh requests"
  on public.bvh_login_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read all bvh requests" on public.bvh_login_requests;
create policy "Admins can read all bvh requests"
  on public.bvh_login_requests
  for select
  to authenticated
  using ((select public.is_admin_or_board()));

drop policy if exists "Admins can update bvh requests" on public.bvh_login_requests;
create policy "Admins can update bvh requests"
  on public.bvh_login_requests
  for update
  to authenticated
  using ((select public.is_admin_or_board()))
  with check ((select public.is_admin_or_board()));

-- ---------------------------------------------------------------------------
-- 4) Gekündigte Konten in Supabase Auth sperren
-- ---------------------------------------------------------------------------
-- Gesperrte Konten bekommen weder per Passwort noch per Refresh-Token eine neue Sitzung.
-- Sperrdatum 2999-12-31 als Kennung: nur diese Sperre wird bei Reaktivierung wieder aufgehoben,
-- andere (manuelle) Sperren bleiben unberührt.

create or replace function public.sync_auth_ban_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  if lower(trim(coalesce(new."Status", ''))) = 'cancelled' then
    update auth.users
       set banned_until = '2999-12-31 00:00:00+00'
     where id = new.user_id
       and (banned_until is null or banned_until < '2999-12-31 00:00:00+00');
  else
    update auth.users
       set banned_until = null
     where id = new.user_id
       and banned_until = '2999-12-31 00:00:00+00';
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_auth_ban_from_profile() from public, anon, authenticated;

drop trigger if exists profiles_sync_auth_ban on public.profiles;
create trigger profiles_sync_auth_ban
  after insert or update of "Status", user_id on public.profiles
  for each row
  execute function public.sync_auth_ban_from_profile();

-- Bestehende gekündigte Konten sperren.
update auth.users u
   set banned_until = '2999-12-31 00:00:00+00'
  from public.profiles p
 where p.user_id = u.id
   and lower(trim(coalesce(p."Status", ''))) = 'cancelled'
   and (u.banned_until is null or u.banned_until < '2999-12-31 00:00:00+00');

-- ---------------------------------------------------------------------------
-- 5) Alumni- und BVH-Anfragen: Stammdaten und Status aus dem Profil
-- ---------------------------------------------------------------------------
-- Name und E-Mail kommen immer aus dem Profil des anfragenden Kontos; Anfragen starten immer
-- offen. Zusammen mit dem Unique-Index „eine offene Anfrage je Konto“ verhindert das, dass
-- jemand per API beliebig viele Anfragen (und damit Mails an den Vorstand) mit eigenem Text anlegt.

create or replace function public.alumni_request_fill_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select pr.id, pr."Vorname" as vorname, pr."Nachname" as nachname, pr."E-Mail" as email
    into p
    from public.profiles pr
   where pr.user_id = new.user_id
   limit 1;

  if p.id is null then
    raise exception 'Kein Profil zum Konto gefunden';
  end if;

  new.profile_id := p.id;
  new.vorname    := coalesce(p.vorname, '');
  new.nachname   := coalesce(p.nachname, '');
  new.email      := p.email;
  new.status     := 'pending';
  new.handled_at := null;
  new.handled_by := null;
  return new;
end;
$$;

revoke execute on function public.alumni_request_fill_from_profile() from public, anon, authenticated;

drop trigger if exists alumni_requests_fill_from_profile on public.alumni_requests;
create trigger alumni_requests_fill_from_profile
  before insert on public.alumni_requests
  for each row
  execute function public.alumni_request_fill_from_profile();

-- Entscheidungsmail: Empfänger aus dem Profil des antragstellenden Kontos.
create or replace function public.enqueue_alumni_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text;
  v_vorname text;
begin
  select pr."E-Mail", pr."Vorname"
    into v_email, v_vorname
    from public.profiles pr
   where pr.user_id = new.user_id
   limit 1;

  insert into public.notification_events (type, profile_id, payload)
  values (
    'alumni_decided',
    new.profile_id,
    jsonb_build_object(
      'request_id', new.id,
      'profile_id', new.profile_id,
      'user_id',    new.user_id,
      'vorname',    coalesce(v_vorname, ''),
      'nachname',   new.nachname,
      'email',      v_email,
      'recipient',  v_email,
      'decision',   new.status,
      'handled_at', new.handled_at
    )
  );
  return new;
end;
$$;

revoke execute on function public.enqueue_alumni_decided() from public, anon, authenticated;

create or replace function public.bvh_request_fill_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select pr.id, pr."Vorname" as vorname, pr."Nachname" as nachname, pr."E-Mail" as email
    into p
    from public.profiles pr
   where pr.user_id = new.user_id
   limit 1;

  if p.id is null then
    raise exception 'Kein Profil zum Konto gefunden';
  end if;

  new.vorname  := coalesce(p.vorname, '');
  new.nachname := coalesce(p.nachname, '');
  new.email    := p.email;
  new.handled  := false;
  return new;
end;
$$;

revoke execute on function public.bvh_request_fill_from_profile() from public, anon, authenticated;

drop trigger if exists bvh_login_requests_fill_from_profile on public.bvh_login_requests;
create trigger bvh_login_requests_fill_from_profile
  before insert on public.bvh_login_requests
  for each row
  execute function public.bvh_request_fill_from_profile();

create unique index if not exists bvh_login_requests_one_open_per_user
  on public.bvh_login_requests (user_id)
  where not handled;

-- ---------------------------------------------------------------------------
-- 6) IBAN-Änderungen merken und melden
-- ---------------------------------------------------------------------------
-- iban_changed_at: letzte Änderung einer bereits hinterlegten IBAN. Der SEPA-Export setzt für
-- Änderungen seit dem letzten XML-Export die Kennzeichnung „Mandatsänderung“ (AmdmntInd, SMNDA).
-- Der Vorstand bekommt eine Mail (nur die letzten 4 Stellen, keine vollständige IBAN).

alter table public.profiles add column if not exists iban_changed_at timestamptz;

alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check
  check (type in (
    'member_registered', 'member_cancelled', 'alumni_requested', 'alumni_decided',
    'event_announcement', 'task_deadline', 'iban_changed', 'test'
  ));

create or replace function public.profiles_track_iban_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text := upper(regexp_replace(coalesce(old."IBAN", ''), '\s', '', 'g'));
  v_new text := upper(regexp_replace(coalesce(new."IBAN", ''), '\s', '', 'g'));
begin
  -- Erstmals hinterlegte IBAN ist keine Mandatsänderung.
  if v_old <> '' and v_old is distinct from v_new then
    new.iban_changed_at := now();
    insert into public.notification_events (type, profile_id, payload)
    values (
      'iban_changed',
      new.id,
      jsonb_build_object(
        'profile_id',     new.id,
        'vorname',        new."Vorname",
        'nachname',       new."Nachname",
        'email',          new."E-Mail",
        'iban_last4',     right(v_new, 4),
        'old_iban_last4', right(v_old, 4),
        'changed_at',     now()
      )
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_track_iban_change() from public, anon, authenticated;

drop trigger if exists profiles_track_iban_change on public.profiles;
create trigger profiles_track_iban_change
  before update of "IBAN" on public.profiles
  for each row
  execute function public.profiles_track_iban_change();

-- ---------------------------------------------------------------------------
-- 7) Protokoll der Finanzexporte
-- ---------------------------------------------------------------------------
create table if not exists public.finance_exports (
  id              uuid primary key default gen_random_uuid(),
  semester        text not null check (semester in ('SoSe', 'WiSe')),
  year            integer not null check (year between 2000 and 2100),
  format          text not null check (format in ('csv', 'xml')),
  collection_date date,
  tx_count        integer not null check (tx_count >= 0),
  total_amount    numeric(12, 2) not null check (total_amount >= 0),
  amended_count   integer not null default 0 check (amended_count >= 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.finance_exports is
  'Protokoll der Finanzexporte (CSV/SEPA-XML). Letzter XML-Export = Bezug für Mandatsänderungen. Nur Service Role.';

create index if not exists finance_exports_created_at_idx on public.finance_exports (format, created_at desc);

alter table public.finance_exports enable row level security;

-- ---------------------------------------------------------------------------
-- 8) Rate-Limit für Login und Passwort-vergessen
-- ---------------------------------------------------------------------------
-- Schlüssel sind Hashes (IP bzw. E-Mail), keine Klartextdaten. Aufruf nur per Service Role.

create table if not exists public.auth_rate_limits (
  key          text primary key check (char_length(key) <= 200),
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);

alter table public.auth_rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_key is null or char_length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.auth_rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else r.window_start
        end,
        hits = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else r.hits + 1
        end
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'auth-rate-limits-cleanup') then
    perform cron.unschedule('auth-rate-limits-cleanup');
  end if;
  perform cron.schedule(
    'auth-rate-limits-cleanup',
    '15 3 * * *',
    $job$delete from public.auth_rate_limits where window_start < now() - interval '1 day'$job$
  );
end $$;

-- ---------------------------------------------------------------------------
-- 9) Rundmail: Sperre prüfen und eintragen in einer Transaktion
-- ---------------------------------------------------------------------------
-- Zwei gleichzeitige Klicks auf „an alle senden“ können so nicht zwei Massenmails auslösen.

create or replace function public.enqueue_event_announcement(
  p_event_id uuid,
  p_payload jsonb,
  p_cooldown_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_payload->>'event_id' is distinct from p_event_id::text then
    raise exception 'payload.event_id passt nicht zum Event';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event_announcement:' || p_event_id::text, 0));

  if p_payload->>'mode' = 'all' and exists (
    select 1
      from public.notification_events n
     where n.type = 'event_announcement'
       and n.payload->>'event_id' = p_event_id::text
       and n.payload->>'mode' = 'all'
       and n.created_at >= now() - make_interval(secs => greatest(p_cooldown_seconds, 0))
  ) then
    return null;
  end if;

  insert into public.notification_events (type, payload)
  values ('event_announcement', p_payload)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.enqueue_event_announcement(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.enqueue_event_announcement(uuid, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 10) Bucket event-images: Auflisten nur für Admins/Vorstand
-- ---------------------------------------------------------------------------
-- Der Bucket bleibt öffentlich: Bilder laden weiter über die öffentliche URL (ohne RLS).
-- SELECT auf storage.objects braucht nur noch, wer hochlädt bzw. löscht.

drop policy if exists "Bilder öffentlich lesbar" on storage.objects;
drop policy if exists "event-images: Admins lesen" on storage.objects;
create policy "event-images: Admins lesen"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'event-images' and (select public.is_admin_or_board()));
