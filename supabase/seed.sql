-- Testdaten für lokale Datenbank, CI und das Test-Projekt (Intranet-Test).
-- NUR erfundene Daten. Niemals gegen die Produktion ausführen.
--
-- Passwort der Testkonten: Einstellung seed.password, im Test-Projekt vorher in derselben Sitzung
-- setzen: select set_config('seed.password', :'pw', false);  (PGOPTIONS reicht der Pooler nicht durch)
-- Ohne Einstellung gilt ein fester Wert, der nur für die lokale/CI-Datenbank gedacht ist.
-- Idempotent: mehrfach ausführbar.

do $$
declare
  v_pw   text := coalesce(nullif(current_setting('seed.password', true), ''), 'lokal-nur-ci-Passwort-1');
  r      record;
begin
  -- Sicherung: nie in der Produktion (dort gibt es echte Profile).
  if (select count(*) from public.profiles) > 50 then
    raise exception 'seed.sql: Datenbank enthält bereits viele Profile – Abbruch (Produktion?)';
  end if;
  if exists (select 1 from auth.users u where u.email is null or u.email not like '%@test.icr.local') then
    raise exception 'seed.sql: Es gibt Konten außerhalb von @test.icr.local – Abbruch (Produktion?)';
  end if;

  for r in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'mitglied@test.icr.local',  'Mia',    'Mitglied',  'member', 'active'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'vorstand@test.icr.local',  'Valentin','Vorstand', 'board',  'active'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'admin@test.icr.local',     'Ada',    'Admin',     'admin',  'active'),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'alumni@test.icr.local',    'Alex',   'Alumni',    'alumni', 'alumni'),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'gekuendigt@test.icr.local','Gerd',   'Gekündigt', 'member', 'cancelled')
    ) as t(id, email, vorname, nachname, rolle, status)
  loop
    if not exists (select 1 from auth.users u where u.id = r.id) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
        extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('Vorname', r.vorname, 'Nachname', r.nachname),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), r.id, r.id::text,
        jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    -- Profil entsteht per Trigger (handle_new_user); hier mit erfundenen Stammdaten füllen.
    update public.profiles p
       set "Rolle" = r.rolle::public.user_role,
           "Status" = r.status,
           "Datum_Antrag" = coalesce(p."Datum_Antrag", date '2024-10-01'),
           "Datum_Kündigung" = case when r.status = 'cancelled' then date '2026-03-31' end,
           "Geburtsdatum" = date '2002-05-17',
           "Straße" = 'Teststraße',
           "Hausnummer" = '1',
           "PLZ" = '93053',
           "Ort" = 'Regensburg',
           "Handynummer" = '+49 151 00000000',
           "Studiengang / Fach" = 'Betriebswirtschaftslehre',
           "Abschluss" = 'Bachelor',
           "Semester" = 3,
           "Hochschulart" = 'Universität',
           -- Offizielle Beispiel-IBAN (nicht belastbar)
           "IBAN" = 'DE89370400440532013000',
           "BIC" = 'COBADEFFXXX',
           "Sepa-Bestätigung" = true,
           "Datum_Mandat" = date '2024-10-01'
     where p.user_id = r.id;
  end loop;

  -- Profil ohne Konto (wie die Altdaten aus den Google Sheets, lückenhaft)
  insert into public.profiles ("id", "E-Mail", "Status", "Rolle", "Vorname", "Nachname", "IBAN")
  values ('00000000-0000-4000-a000-000000000010', 'altmitglied@test.icr.local', 'active', 'member', 'Otto', 'Altdaten', null)
  on conflict ("id") do nothing;

  insert into public.events (id, title, description, event_date, event_time, location, requires_registration)
  values
    ('00000000-0000-4000-b000-000000000001', 'Stammtisch (Test)', 'Erfundenes Event für Tests.', current_date + 7, '19:00', 'Regensburg', true),
    ('00000000-0000-4000-b000-000000000002', 'Vortrag Börse (Test)', 'Erfundenes Event ohne Anmeldung.', current_date + 21, '18:00', 'Hörsaal H2', false)
  on conflict (id) do nothing;

  insert into public.news (id, title, content, author_id)
  values ('00000000-0000-4000-c000-000000000001', 'Willkommen im Test-Intranet', 'Diese Nachricht ist erfunden.', '00000000-0000-4000-a000-000000000002')
  on conflict (id) do nothing;

  insert into public.board_tasks (id, title, description, status, priority, deadline, created_by)
  values ('00000000-0000-4000-d000-000000000001', 'Test-Aufgabe', 'Erfundene Aufgabe.', 'planned', 'normal', current_date + 3, '00000000-0000-4000-a000-000000000002')
  on conflict (id) do nothing;

  insert into public.board_task_assignees (task_id, profile_id)
  values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000002')
  on conflict do nothing;
end $$;
