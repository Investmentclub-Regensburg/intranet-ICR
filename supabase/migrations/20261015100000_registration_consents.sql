-- Registrierung: Mandatsdatum und Satzungsbestätigung ins Profil übernehmen.
--
-- Bisher blieben "Datum_Mandat" und "Vereinsatzung-Bestätigung" bei neuen Mitgliedern leer (nur der
-- Datenimport vom Februar 2026 hatte sie befüllt).
--   * "Datum_Mandat": Tag der Registrierung (= "Datum_Antrag"), wenn das SEPA-Mandat bestätigt wurde.
--   * "Vereinsatzung-Bestätigung": aus den Registrierungsdaten (die App setzt sie beim Absenden, der
--     letzte Schritt verlangt die Annahme der Satzung).
-- Bestehende Profile bleiben unverändert. Beide Funktionen sind die Fassung aus
-- 20261014100000_member_plaintext_clearing.sql mit genau diesen Ergänzungen.
--
-- Idempotent: mehrfach ausführbar.

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
  statute_accepted boolean;
  v_cleared       boolean := public.member_plain_cleared();
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
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb)
       || coalesce((select r.data from public.pending_registrations r where r.user_id = u.id), '{}'::jsonb);
  -- Endzustand: sensible Angaben kommen nur verschlüsselt (adopt_pending_secrets), nie als Klartext.
  if v_cleared then
    meta := meta - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];
  end if;

  birth_date := public.registration_date(meta->>'Geburtsdatum');

  if (meta->>'Semester') ~ '^\d{1,2}$' then
    semester_number := (meta->>'Semester')::integer;
  end if;

  sepa_confirmed := lower(coalesce(meta->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');
  statute_accepted := lower(coalesce(meta->>'Vereinsatzung-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');

  insert into public.profiles (
    "id", "user_id", "E-Mail", "Status", "Rolle", "Datum_Antrag",
    "Vorname", "Nachname", "Geburtsdatum", "Straße", "Hausnummer", "Ort", "PLZ",
    "Handynummer", "Studiengang / Fach", "Abschluss", "Semester", "Hochschulart",
    "IBAN", "BIC", "Sepa-Bestätigung", "Datum_Mandat", "Vereinsatzung-Bestätigung"
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
    sepa_confirmed,
    case when sepa_confirmed then current_date end,
    statute_accepted
  );
end;
$$;

create or replace function public.handle_pending_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb := new.data;
begin
  if exists (select 1 from auth.users u where u.id = new.user_id and u.email_confirmed_at is not null) then
    perform public.provision_profile_for_auth_user(new.user_id, false);

    -- Endzustand: sensible Felder nie aus dem Klartext nachfüllen.
    if public.member_plain_cleared() then
      d := d - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];
    end if;

    update public.profiles p
       set "Geburtsdatum"       = coalesce(p."Geburtsdatum",
                                    public.registration_date(d->>'Geburtsdatum')),
           "Straße"             = coalesce(nullif(p."Straße", ''), left(d->>'Straße', 100)),
           "Hausnummer"         = coalesce(nullif(p."Hausnummer", ''), left(d->>'Hausnr', 20)),
           "Ort"                = coalesce(nullif(p."Ort", ''), left(d->>'Ort', 100)),
           "PLZ"                = coalesce(nullif(p."PLZ", ''), left(d->>'PLZ', 10)),
           "Handynummer"        = coalesce(nullif(p."Handynummer", ''), left(d->>'Handynummer', 40)),
           "Studiengang / Fach" = coalesce(nullif(p."Studiengang / Fach", ''), left(d->>'Fach', 150)),
           "Abschluss"          = coalesce(nullif(p."Abschluss", ''), left(d->>'Abschluss', 150)),
           "Semester"           = coalesce(p."Semester",
                                    case when (d->>'Semester') ~ '^\d{1,2}$' then (d->>'Semester')::integer end),
           "Hochschulart"       = coalesce(nullif(p."Hochschulart", ''), left(d->>'Uni/OTH', 150)),
           "IBAN"               = coalesce(nullif(p."IBAN", ''), left(d->>'IBAN', 34)),
           "BIC"                = coalesce(nullif(p."BIC", ''), left(d->>'BIC', 11)),
           "Sepa-Bestätigung"   = coalesce(p."Sepa-Bestätigung", false)
                                  or lower(coalesce(d->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on'),
           "Datum_Mandat"       = coalesce(p."Datum_Mandat",
                                    case when lower(coalesce(d->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on')
                                         then p."Datum_Antrag" end),
           "Vereinsatzung-Bestätigung" = coalesce(p."Vereinsatzung-Bestätigung", false)
                                  or lower(coalesce(d->>'Vereinsatzung-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on')
     where p.user_id = new.user_id
       and p.id = new.user_id
       and p."Datum_Antrag" = current_date
       and not exists (select 1 from public.member_secrets ms where ms.profile_id = p.id);

    perform public.finish_pending_registration(new.user_id);
  end if;
  return null;
end;
$$;
