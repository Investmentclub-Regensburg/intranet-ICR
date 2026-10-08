-- ENTWURF – vor Ausführung gegen Schema-Dump prüfen
--
-- Geprüft gegen den Schema-Export vom 2026-10-08: Spalten von alumni_requests und
-- bvh_login_requests sowie der Trigger alumni_requests_decided stimmen. Offen bleibt die
-- Duplikat-Abfrage unten (braucht die Daten); bei Duplikaten bricht der Unique-Index ab.
--
-- Alumni- und BVH-Anfragen: Stammdaten immer aus dem Profil des anfragenden Kontos
--
-- Wirkung:
--   * BEFORE INSERT auf alumni_requests und bvh_login_requests: profile_id (nur Alumni),
--     vorname, nachname und email werden aus profiles (user_id = new.user_id) übernommen,
--     unabhängig von den übergebenen Werten; Status-/Bearbeitungsfelder starten leer.
--     Ohne Profil wird die Anfrage abgelehnt.
--   * Höchstens eine offene BVH-Anfrage je Konto (Partial Unique Index).
--   * enqueue_alumni_decided(): Empfänger der Entscheidungsmail aus profiles."E-Mail".
--     (Die Edge Function notify-board ermittelt den Empfänger inzwischen selbst aus dem Profil;
--     das hier hält die Outbox-Daten konsistent.)
-- Die App (requestAlumniStatus, requestBvhLogin) funktioniert unverändert weiter.
--
-- Vor der Ausführung prüfen:
--   * Tabelle bvh_login_requests existiert wie in supabase-bvh-login.sql beschrieben.
--   * Doppelte offene BVH-Anfragen (sonst schlägt der Unique Index fehl):
--       select user_id, count(*) from public.bvh_login_requests where not handled group by 1 having count(*) > 1;
--     Überzählige vorher auf handled = true setzen.
--
-- Ausführen: wie Entwurf 20261008120000 (Zeile "set icr.apply_drafts = on;" voranstellen).

do $$
begin
  if coalesce(current_setting('icr.apply_drafts', true), '') <> 'on' then
    raise exception 'ENTWURF – vor Ausführung gegen Schema-Dump prüfen (set icr.apply_drafts = on)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Alumni-Anträge
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- BVH-Login-Anfragen
-- ---------------------------------------------------------------------------
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
