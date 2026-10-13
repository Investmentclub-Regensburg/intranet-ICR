-- Verschlüsselung Phase 0: sensible Registrierungsdaten raus aus dem Supabase-Konto
--
-- Bisher hat die Registrierung IBAN, BIC, Geburtsdatum, Adresse, Handynummer usw. als
-- Zusatzdaten (raw_user_meta_data) am Konto abgelegt. Dort blieben sie dauerhaft im Klartext
-- liegen und standen über das Zugangstoken auch im Session-Cookie.
--
--  1) public.pending_registrations: Registrierungsdaten bis zur E-Mail-Bestätigung, nur Service
--     Role. Die Registrierung (app/register/actions.ts) schreibt sie hierhin; am Konto stehen nur
--     noch Vor- und Nachname.
--  2) provision_profile_for_auth_user(): liest zuerst pending_registrations, danach wie bisher die
--     Zusatzdaten (ältere, noch unbestätigte Konten).
--  3) Grundregel für alles Entfernen: registration_meta_is_redundant() – jedes Feld der
--     Registrierungsdaten muss im Profil mit GLEICHEM Wert stehen (normalisiert: Groß/Klein,
--     Leerzeichen; bei IBAN/BIC/Telefon ohne Trennzeichen; Sepa nur, wenn im Profil auch true).
--     Sonst bleibt alles liegen und wird von Hand abgeglichen.
--     * pending_registrations: Eintrag wird nur gelöscht, wenn das Profil alles enthält. Wird ein
--       älteres Profil (z. B. aus den Google Sheets) verknüpft, bleiben abweichende Angaben stehen.
--     * Zusatzdaten am Konto: einmalig für die bestehenden Konten (Stand 11.10.2026: 25 von 27)
--       und dauerhaft per BEFORE-UPDATE-Trigger auf auth.users (Rückfallweg der Registrierung,
--       falls Supabase Auth alte Zusatzdaten zurückschreibt).
--  4) Sicherung: Vor der einmaligen Bereinigung werden die betroffenen Zusatzdaten nach
--     private.registration_meta_backup kopiert (nicht über die API erreichbar). Nach der Kontrolle
--     bewusst löschen: drop table private.registration_meta_backup;
--
-- Gelöscht werden ausschließlich Schlüssel in auth.users.raw_user_meta_data und Zeilen in
-- pending_registrations. Profile und Konten werden nicht geändert oder gelöscht (Ausnahme: ein am
-- selben Tag ohne E-Mail-Bestätigung angelegtes Profil, dessen LEERE Felder gefüllt werden).
--
-- Reihenfolge: egal. Der Code schreibt in pending_registrations und fällt ohne Tabelle auf die
-- Zusatzdaten zurück.
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Registrierungsdaten bis zur Bestätigung
-- ---------------------------------------------------------------------------
create table if not exists public.pending_registrations (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.pending_registrations is
  'Registrierungsdaten bis zur E-Mail-Bestätigung (danach im Profil). Nur Service Role.';

alter table public.pending_registrations enable row level security;
revoke all on public.pending_registrations from anon, authenticated;

-- Schlüssel, die nicht mehr am Konto stehen sollen (Vorname/Nachname bleiben).
create or replace function public.registration_meta_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'Ort', 'PLZ', 'Handynummer',
    'Fach', 'Abschluss', 'Semester', 'Uni/OTH', 'Sepa-Bestätigung'
  ];
$$;

revoke execute on function public.registration_meta_keys() from public, anon, authenticated;

-- Vergleichsform für Text: Groß/Klein und Leerzeichen egal, leer = null.
create or replace function public.registration_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '');
$$;

revoke execute on function public.registration_norm(text) from public, anon, authenticated;

-- Vergleichsform für IBAN, BIC, Telefon, PLZ: ohne Leerzeichen und Trennzeichen, Großbuchstaben.
create or replace function public.registration_compact(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s/().-]', '', 'g')), '');
$$;

revoke execute on function public.registration_compact(text) from public, anon, authenticated;

-- Datum aus den Registrierungsdaten; ungültige Werte (z. B. 2000-02-30) ergeben null statt eines
-- Fehlers, der sonst die E-Mail-Bestätigung blockieren würde.
create or replace function public.registration_date(p text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  if p ~ '^\d{4}-\d{2}-\d{2}$' then
    return p::date;
  end if;
  return null;
exception
  when others then
    return null;
end;
$$;

revoke execute on function public.registration_date(text) from public, anon, authenticated;

-- true nur, wenn JEDES Feld der Registrierungsdaten im Profil mit gleichem Wert steht.
-- Felder, die in den Registrierungsdaten leer sind, zählen nicht. Kein Profil → false.
create or replace function public.registration_meta_is_redundant(p_meta jsonb, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
          (public.registration_compact(p_meta->>'IBAN') is null
            or public.registration_compact(p_meta->>'IBAN') = public.registration_compact(p."IBAN"))
      and (public.registration_compact(p_meta->>'BIC') is null
            or public.registration_compact(p_meta->>'BIC') = public.registration_compact(p."BIC"))
      and (public.registration_compact(p_meta->>'Handynummer') is null
            or public.registration_compact(p_meta->>'Handynummer') = public.registration_compact(p."Handynummer"))
      and (public.registration_compact(p_meta->>'PLZ') is null
            or public.registration_compact(p_meta->>'PLZ') = public.registration_compact(p."PLZ"))
      and (public.registration_norm(p_meta->>'Geburtsdatum') is null
            or public.registration_norm(p_meta->>'Geburtsdatum') = to_char(p."Geburtsdatum", 'YYYY-MM-DD'))
      and (public.registration_norm(p_meta->>'Semester') is null
            or public.registration_norm(p_meta->>'Semester') = p."Semester"::text)
      and (public.registration_norm(p_meta->>'Straße') is null
            or public.registration_norm(p_meta->>'Straße') = public.registration_norm(p."Straße"))
      and (public.registration_norm(p_meta->>'Hausnr') is null
            or public.registration_norm(p_meta->>'Hausnr') = public.registration_norm(p."Hausnummer"))
      and (public.registration_norm(p_meta->>'Ort') is null
            or public.registration_norm(p_meta->>'Ort') = public.registration_norm(p."Ort"))
      and (public.registration_norm(p_meta->>'Fach') is null
            or public.registration_norm(p_meta->>'Fach') = public.registration_norm(p."Studiengang / Fach"))
      and (public.registration_norm(p_meta->>'Abschluss') is null
            or public.registration_norm(p_meta->>'Abschluss') = public.registration_norm(p."Abschluss"))
      and (public.registration_norm(p_meta->>'Uni/OTH') is null
            or public.registration_norm(p_meta->>'Uni/OTH') = public.registration_norm(p."Hochschulart"))
      and (coalesce(public.registration_norm(p_meta->>'Sepa-Bestätigung'), 'false') not in ('true', 't', '1', 'yes', 'on')
            or p."Sepa-Bestätigung" is true)
      from public.profiles p
     where p.id = p_profile_id
  ), false);
$$;

revoke execute on function public.registration_meta_is_redundant(jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Profil anlegen: Daten aus pending_registrations (Vorrang) oder den Zusatzdaten
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
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb)
       || coalesce((select r.data from public.pending_registrations r where r.user_id = u.id), '{}'::jsonb);

  birth_date := public.registration_date(meta->>'Geburtsdatum');

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

-- Eintrag in pending_registrations nur entfernen, wenn das verknüpfte Profil alle Angaben mit
-- gleichem Wert enthält. Sonst (z. B. älteres Profil mit anderer IBAN) bleibt er für den Abgleich.
create or replace function public.finish_pending_registration(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_registrations r
   using public.profiles p
   where r.user_id = p_user_id
     and p.user_id = p_user_id
     and public.registration_meta_is_redundant(r.data, p.id);
$$;

revoke execute on function public.finish_pending_registration(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    perform public.provision_profile_for_auth_user(new.id, false);
    perform public.finish_pending_registration(new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.provision_profile_for_auth_user(new.id, true);
    perform public.finish_pending_registration(new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_confirmed() from public, anon, authenticated;

-- Ist das Konto beim Eintragen schon bestätigt (Bestätigung per Mail abgeschaltet), lief
-- handle_new_user() vor dem Eintrag und hat das Profil nur mit den Namen angelegt: Profil anlegen
-- bzw. die leeren Felder des eben angelegten Profils füllen. Vorhandene Werte bleiben unverändert;
-- ältere (verknüpfte) Profile werden nicht angefasst.
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
                                  or lower(coalesce(d->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on')
     where p.user_id = new.user_id
       and p.id = new.user_id
       and p."Datum_Antrag" = current_date;

    perform public.finish_pending_registration(new.user_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.handle_pending_registration() from public, anon, authenticated;

drop trigger if exists on_pending_registration on public.pending_registrations;
create trigger on_pending_registration
  after insert or update of data on public.pending_registrations
  for each row
  execute function public.handle_pending_registration();

-- ---------------------------------------------------------------------------
-- 3) Zusatzdaten am Konto bereinigen (nur wenn das Profil alles enthält)
-- ---------------------------------------------------------------------------
create or replace function public.strip_registration_meta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if jsonb_typeof(new.raw_user_meta_data) = 'object'
     and new.raw_user_meta_data ?| public.registration_meta_keys() then
    select p.id into v_profile_id from public.profiles p where p.user_id = new.id;
    if v_profile_id is not null
       and public.registration_meta_is_redundant(new.raw_user_meta_data, v_profile_id) then
      new.raw_user_meta_data := new.raw_user_meta_data - public.registration_meta_keys();
    end if;
  end if;
  return new;
exception
  -- Ein Login darf nie an dieser Bereinigung scheitern.
  when others then
    raise warning 'strip_registration_meta: %', sqlstate;
    return new;
end;
$$;

revoke execute on function public.strip_registration_meta() from public, anon, authenticated;


-- Einmalig für die bestehenden Konten, vorher Sicherung.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.registration_meta_backup (
  user_id            uuid primary key,
  raw_user_meta_data jsonb not null,
  backed_up_at       timestamptz not null default now()
);

comment on table private.registration_meta_backup is
  'Sicherung der Zusatzdaten vor der Bereinigung am 11.10.2026. Nach Kontrolle löschen.';

alter table private.registration_meta_backup enable row level security;
revoke all on private.registration_meta_backup from public, anon, authenticated;

do $$
declare
  v_before   integer;
  v_cleaned  integer;
  v_left     integer;
begin
  select count(*) into v_before
    from auth.users u
   where u.raw_user_meta_data ?| public.registration_meta_keys();

  -- Sicherung der Zeilen, die gleich bereinigt werden (nur einmal je Konto).
  insert into private.registration_meta_backup (user_id, raw_user_meta_data)
  select u.id, u.raw_user_meta_data
    from auth.users u
    join public.profiles p on p.user_id = u.id
   where u.raw_user_meta_data ?| public.registration_meta_keys()
     and public.registration_meta_is_redundant(u.raw_user_meta_data, p.id)
  on conflict (user_id) do nothing;

  update auth.users u
     set raw_user_meta_data = u.raw_user_meta_data - public.registration_meta_keys()
    from public.profiles p
   where p.user_id = u.id
     and u.raw_user_meta_data ?| public.registration_meta_keys()
     and public.registration_meta_is_redundant(u.raw_user_meta_data, p.id);
  get diagnostics v_cleaned = row_count;

  select count(*) into v_left
    from auth.users u
   where u.raw_user_meta_data ?| public.registration_meta_keys();

  raise notice 'Zusatzdaten: % Konten betroffen, % bereinigt (gesichert in private.registration_meta_backup), % unverändert (Prüfung von Hand)',
    v_before, v_cleaned, v_left;
end $$;

-- Trigger erst nach Sicherung und einmaliger Bereinigung anlegen.
drop trigger if exists strip_registration_meta on auth.users;
create trigger strip_registration_meta
  before update on auth.users
  for each row
  execute function public.strip_registration_meta();
