-- ENTWURF – vor Ausführung gegen Schema-Dump prüfen
--
-- Geprüft gegen den Schema-Export vom 2026-10-08: passt ohne Änderung.
--   * "Confirm email" ist aktiv.
--   * Trigger on_auth_user_created (AFTER INSERT auf auth.users) ruft public.handle_new_user() auf.
--   * profiles."Status" ist text ohne Check-Constraint, "Rolle" ist public.user_role,
--     Unique-Constraint auf "E-Mail" und created_at sind vorhanden.
--   * profiles.id hat keinen Default; provision_profile_for_auth_user() setzt ihn (= auth.users.id).
--   Offen bleibt nur Prüfschritt 4 (Kontrollabfrage, braucht die Daten).
--
-- Profil-Verknüpfung erst nach bestätigter E-Mail-Adresse
--
-- Bisher (20260513120000_fix_auth_profile_trigger.sql): handle_new_user() verknüpft ein neues
-- Auth-Konto schon beim Anlegen (vor der E-Mail-Bestätigung) mit einem vorhandenen Profil
-- gleicher E-Mail-Adresse.
--
-- Neu:
--   * Ein bestehendes Profil wird erst verknüpft, wenn auth.users.email_confirmed_at gesetzt wird
--     (Trigger on_auth_user_email_confirmed).
--   * Ein neues Profil entsteht ebenfalls erst mit bestätigter Adresse. Ist die Adresse schon beim
--     Anlegen bestätigt (z. B. "Confirm email" aus oder vom Vorstand angelegtes Konto), wird nur
--     für unbekannte Adressen ein neues Profil angelegt – ein bestehendes Profil wird dann NICHT
--     automatisch übernommen (Verknüpfung in dem Fall manuell durch den Vorstand).
--   * Status neuer Profile über public.registrations_require_approval() (hier: false = wie bisher
--     'active'; eine Freigabe durch den Vorstand ist nicht vorgesehen, Entwurf dazu entfernt).
--   * Registrierungsdaten werden auf sinnvolle Längen gekürzt.
--
-- Vor der Ausführung prüfen:
--   1. Supabase Auth → "Confirm email" ist aktiv (sonst siehe oben).
--   2. Welcher Trigger auf auth.users ruft public.handle_new_user() auf (AFTER INSERT)?
--        select trigger_name, action_timing, event_manipulation, action_statement
--        from information_schema.triggers where event_object_schema = 'auth' and event_object_table = 'users';
--   3. Spaltentypen von public.profiles ("Status", "Rolle" text oder Enum? 'applicant' zulässig?),
--      Unique-Constraint auf "E-Mail", Spalte created_at vorhanden.
--   4. Kontrollabfrage (nur Zahlen): verknüpfte Profile, deren Konto nie bestätigt wurde
--        select count(*) from public.profiles p join auth.users u on u.id = p.user_id
--        where u.email_confirmed_at is null;
--      Ist das Ergebnis > 0: diese Fälle einzeln mit dem Vorstand prüfen.
--
-- Ausführen (nach Prüfung, zuerst in einer Staging-Umgebung): im SQL-Editor die Zeile
--   set icr.apply_drafts = on;
-- voranstellen und zusammen mit dieser Datei ausführen. Ohne diese Zeile bricht der Block
-- unten ab (Schutz gegen versehentliches Ausführen, z. B. per `supabase db push`).

do $$
begin
  if coalesce(current_setting('icr.apply_drafts', true), '') <> 'on' then
    raise exception 'ENTWURF – vor Ausführung gegen Schema-Dump prüfen (set icr.apply_drafts = on)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Schalter: brauchen neue Registrierungen eine Freigabe durch den Vorstand?
-- false = bisheriges Verhalten (neue Profile sofort 'active').
-- ---------------------------------------------------------------------------
create or replace function public.registrations_require_approval()
returns boolean
language sql
stable
set search_path = ''
as $$
  select false
$$;

revoke execute on function public.registrations_require_approval() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profil zu einem Auth-Konto anlegen bzw. ein bestehendes Profil verknüpfen.
-- p_link_existing = true nur aufrufen, wenn die E-Mail-Adresse bestätigt wurde.
-- ---------------------------------------------------------------------------
create or replace function public.provision_profile_for_auth_user(p_user_id uuid, p_link_existing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u               auth.users%rowtype;
  meta            jsonb;
  v_status        public.profiles."Status"%type;
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

  if public.registrations_require_approval() then
    v_status := 'applicant';
  else
    v_status := 'active';
  end if;

  insert into public.profiles (
    "id", "user_id", "E-Mail", "Status", "Rolle", "Datum_Antrag",
    "Vorname", "Nachname", "Geburtsdatum", "Straße", "Hausnummer", "Ort", "PLZ",
    "Handynummer", "Studiengang / Fach", "Abschluss", "Semester", "Hochschulart",
    "IBAN", "BIC", "Sepa-Bestätigung"
  )
  values (
    u.id, u.id, u.email, v_status, 'member', current_date,
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

-- ---------------------------------------------------------------------------
-- INSERT auf auth.users (bestehender Trigger ruft weiterhin handle_new_user() auf).
-- Nie ein bestehendes Profil übernehmen; neue Profile nur bei bereits bestätigter Adresse.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- UPDATE auf auth.users: Adresse wurde bestätigt → Profil anlegen bzw. verknüpfen.
-- ---------------------------------------------------------------------------
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
