-- Vorstands-Benachrichtigungen (Registrierung, Kündigung, Alumni-Antrag)
--
-- Aufbau:
--   1) public.notification_events  – Outbox: jedes relevante Ereignis wird als Zeile abgelegt
--   2) public.alumni_requests      – Alumni-Anträge aus dem Profil (analog bvh_login_requests)
--   3) Trigger auf profiles / alumni_requests, die nur in die Outbox schreiben
--   4) Dispatch-Trigger auf der Outbox, der per pg_net die Edge Function "notify-board" aufruft
--
-- Die Edge Function liest das Event per Service Role, verschickt die Mail über Resend
-- und setzt sent_at bzw. last_error. URL und Shared Secret liegen im Supabase Vault
-- (Namen: notify_board_url, notify_board_secret) – NICHT in dieser Datei.
--
-- Idempotent: mehrfach ausführbar.

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- 1) Outbox
-- ---------------------------------------------------------------------------
create table if not exists public.notification_events (
  id          uuid primary key default gen_random_uuid(),
  type        text not null
              check (type in ('member_registered', 'member_cancelled', 'alumni_requested', 'test')),
  profile_id  uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    integer not null default 0,
  last_error  text
);

comment on table public.notification_events is
  'Outbox für Vorstands-Benachrichtigungen. Wird von Triggern befüllt und von der Edge Function notify-board abgearbeitet.';

create index if not exists notification_events_created_at_idx
  on public.notification_events (created_at desc);
create index if not exists notification_events_pending_idx
  on public.notification_events (created_at)
  where sent_at is null;

-- Nur Service Role (Edge Function / Server Actions) – keine Policies für authenticated/anon.
alter table public.notification_events enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Alumni-Anträge
-- ---------------------------------------------------------------------------
create table if not exists public.alumni_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  vorname     text not null default '',
  nachname    text not null default '',
  email       text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references auth.users(id) on delete set null
);

comment on table public.alumni_requests is
  'Anträge von Mitgliedern auf den Alumni-Status. Freigabe durch den Vorstand setzt profiles.Rolle = alumni.';

-- Pro Nutzer höchstens ein offener Antrag.
create unique index if not exists alumni_requests_one_pending_per_user
  on public.alumni_requests (user_id)
  where status = 'pending';
create index if not exists alumni_requests_created_at_idx
  on public.alumni_requests (created_at desc);
create index if not exists alumni_requests_profile_id_idx
  on public.alumni_requests (profile_id);

alter table public.alumni_requests enable row level security;

drop policy if exists "Users can insert own alumni request" on public.alumni_requests;
create policy "Users can insert own alumni request"
  on public.alumni_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own alumni requests" on public.alumni_requests;
create policy "Users can read own alumni requests"
  on public.alumni_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can read all alumni requests" on public.alumni_requests;
create policy "Admins can read all alumni requests"
  on public.alumni_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid()
        and lower(trim(profiles."Rolle"::text)) in ('admin', 'board')
    )
  );

-- Updates (Freigabe/Ablehnung) laufen über die Service Role in Server Actions.

-- ---------------------------------------------------------------------------
-- 3) Trigger-Funktionen: Ereignis -> Outbox
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_member_registered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_events (type, profile_id, payload)
  values (
    'member_registered',
    new.id,
    jsonb_build_object(
      'profile_id',   new.id,
      'user_id',      new.user_id,
      'vorname',      new."Vorname",
      'nachname',     new."Nachname",
      'email',        new."E-Mail",
      'studiengang',  new."Studiengang / Fach",
      'abschluss',    new."Abschluss",
      'semester',     new."Semester",
      'hochschulart', new."Hochschulart",
      'ort',          new."Ort",
      'datum_antrag', new."Datum_Antrag",
      'status',       new."Status",
      'rolle',        new."Rolle"
    )
  );
  return new;
end;
$$;

create or replace function public.enqueue_member_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_events (type, profile_id, payload)
  values (
    'member_cancelled',
    new.id,
    jsonb_build_object(
      'profile_id',      new.id,
      'user_id',         new.user_id,
      'vorname',         new."Vorname",
      'nachname',        new."Nachname",
      'email',           new."E-Mail",
      'mitgliedsnummer', new."Mitgliedsnummer",
      'studiengang',     new."Studiengang / Fach",
      'datum_antrag',    new."Datum_Antrag",
      'datum_kuendigung', new."Datum_Kündigung",
      'rolle',           new."Rolle",
      'status_vorher',   old."Status"
    )
  );
  return new;
end;
$$;

create or replace function public.enqueue_alumni_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select
    pr."Studiengang / Fach" as studiengang,
    pr."Datum_Antrag"       as datum_antrag,
    pr."Rolle"              as rolle
  into p
  from public.profiles pr
  where pr.id = new.profile_id;

  insert into public.notification_events (type, profile_id, payload)
  values (
    'alumni_requested',
    new.profile_id,
    jsonb_build_object(
      'request_id',   new.id,
      'profile_id',   new.profile_id,
      'user_id',      new.user_id,
      'vorname',      new.vorname,
      'nachname',     new.nachname,
      'email',        new.email,
      'studiengang',  p.studiengang,
      'datum_antrag', p.datum_antrag,
      'rolle',        p.rolle
    )
  );
  return new;
end;
$$;

-- Wird die Rolle (egal auf welchem Weg) auf alumni gesetzt, offene Anträge automatisch schließen.
create or replace function public.close_alumni_requests_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alumni_requests
  set status = 'approved',
      handled_at = coalesce(handled_at, now())
  where profile_id = new.id
    and status = 'pending';
  return new;
end;
$$;

revoke execute on function public.enqueue_member_registered() from public, anon, authenticated;
revoke execute on function public.enqueue_member_cancelled() from public, anon, authenticated;
revoke execute on function public.enqueue_alumni_requested() from public, anon, authenticated;
revoke execute on function public.close_alumni_requests_on_role_change() from public, anon, authenticated;

drop trigger if exists profiles_member_registered on public.profiles;
create trigger profiles_member_registered
  after insert on public.profiles
  for each row
  execute function public.enqueue_member_registered();

drop trigger if exists profiles_member_cancelled on public.profiles;
create trigger profiles_member_cancelled
  after update of "Status" on public.profiles
  for each row
  when (
    lower(trim(coalesce(old."Status", ''))) <> 'cancelled'
    and lower(trim(coalesce(new."Status", ''))) = 'cancelled'
  )
  execute function public.enqueue_member_cancelled();

drop trigger if exists profiles_close_alumni_requests on public.profiles;
create trigger profiles_close_alumni_requests
  after update of "Rolle" on public.profiles
  for each row
  when (new."Rolle" = 'alumni' and old."Rolle" is distinct from new."Rolle")
  execute function public.close_alumni_requests_on_role_change();

drop trigger if exists alumni_requests_requested on public.alumni_requests;
create trigger alumni_requests_requested
  after insert on public.alumni_requests
  for each row
  execute function public.enqueue_alumni_requested();

-- ---------------------------------------------------------------------------
-- 4) Dispatch: Outbox -> Edge Function (pg_net, asynchron nach Commit)
-- ---------------------------------------------------------------------------
-- Vault-Secrets (einmalig im SQL Editor anlegen, NICHT ins Repo):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-board', 'notify_board_url');
--   select vault.create_secret('<zufälliges Secret>', 'notify_board_secret');
-- Dasselbe Secret als Edge-Function-Secret NOTIFY_BOARD_SECRET hinterlegen.
create or replace function public.dispatch_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url    text;
  fn_secret text;
begin
  select s.decrypted_secret into fn_url
  from vault.decrypted_secrets s
  where s.name = 'notify_board_url'
  limit 1;

  select s.decrypted_secret into fn_secret
  from vault.decrypted_secrets s
  where s.name = 'notify_board_secret'
  limit 1;

  if fn_url is null or fn_secret is null then
    raise warning 'notify_board: Vault-Secrets fehlen – Event % bleibt in der Outbox', new.id;
    return new;
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('event_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', fn_secret
    ),
    timeout_milliseconds := 8000
  );

  return new;
end;
$$;

revoke execute on function public.dispatch_notification_event() from public, anon, authenticated;

drop trigger if exists notification_events_dispatch on public.notification_events;
create trigger notification_events_dispatch
  after insert on public.notification_events
  for each row
  execute function public.dispatch_notification_event();
