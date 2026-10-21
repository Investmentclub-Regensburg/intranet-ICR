-- Verschlüsselung: Übergangslogik entfernen (docs/verschluesselung.md, „Aufräumen nach dem Abschluss“)
--
-- Seit dem 21.10.2026 ist die Produktion im Endzustand (member_crypto_state.plain_cleared_at gesetzt, kein
-- sensibler Klartext mehr in profiles). Entfernt wird, was nur für die Übergangsphase galt:
--   * save_member_secrets schreibt keinen Klartext mehr mit. p_plain trägt nur noch die Namen der geänderten
--     Felder (Korrekturprotokoll), Werte werden ignoriert. Die Signatur bleibt, damit App und Datenbank beim
--     Deploy in beliebiger Reihenfolge zusammenpassen.
--   * Trigger profiles_track_iban_change und profiles_guard_sensitive_plain (im Endzustand wirkungslos;
--     IBAN-Änderungen meldet save_member_secrets).
--   * Registrierung: sensible Angaben nie mehr ins Profil (weder aus pending_registrations noch aus den
--     Konto-Metadaten). Sie kommen nur verschlüsselt (adopt_pending_secrets).
--   * Konto-Metadaten: sensible Angaben werden immer entfernt, auch schon beim Anlegen des Kontos.
--   * finish_pending_registration: kein Zweig mehr für Registrierungen nur mit Klartext.
-- Bleiben: die leeren Klartextspalten, profiles_block_sensitive_plain, member_crypto_state, Prüflauf.
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Speichern ohne Dual Write
-- ---------------------------------------------------------------------------
create or replace function public.save_member_secrets(
  p_profile_id       uuid,
  p_expected_version integer,
  p_wrapped_dek      text,
  p_secrets          jsonb,
  p_iban_hash        text,
  p_iban_last4       text,
  p_iban_changed     boolean,
  p_plain            jsonb,
  p_corrected_by     uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile    public.profiles%rowtype;
  v_old_last4  text;
  v_version    integer;
  v_rows       integer;
  v_fields     text[];
  s            jsonb := coalesce(p_secrets, '{}'::jsonb);
begin
  -- Alle 8 Felder müssen übergeben werden (fehlende würden sonst still geleert).
  if not (s ?& array['iban', 'bic', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'ort', 'handynummer']) then
    raise exception 'member_secrets: p_secrets muss alle 8 Felder enthalten';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'member_secrets: Profil % nicht gefunden', p_profile_id;
  end if;

  select ms.iban_last4 into v_old_last4 from public.member_secrets ms where ms.profile_id = p_profile_id;

  if p_expected_version is null then
    insert into public.member_secrets (
      profile_id, wrapped_dek, iban, bic, geburtsdatum, strasse, hausnummer, plz, ort, handynummer,
      iban_hash, iban_last4
    ) values (
      p_profile_id, p_wrapped_dek, s->>'iban', s->>'bic', s->>'geburtsdatum', s->>'strasse',
      s->>'hausnummer', s->>'plz', s->>'ort', s->>'handynummer', p_iban_hash, p_iban_last4
    )
    on conflict (profile_id) do nothing
    returning version into v_version;
    get diagnostics v_rows = row_count;
  else
    update public.member_secrets ms
       set iban = s->>'iban', bic = s->>'bic', geburtsdatum = s->>'geburtsdatum', strasse = s->>'strasse',
           hausnummer = s->>'hausnummer', plz = s->>'plz', ort = s->>'ort', handynummer = s->>'handynummer',
           iban_hash = p_iban_hash, iban_last4 = p_iban_last4
     where ms.profile_id = p_profile_id
       and ms.version = p_expected_version
       and ms.wrapped_dek = p_wrapped_dek
    returning ms.version into v_version;
    get diagnostics v_rows = row_count;
  end if;

  if v_rows = 0 then
    raise exception 'member_secrets_conflict';
  end if;

  if p_iban_changed then
    update public.profiles p set iban_changed_at = now() where p.id = p_profile_id;
  end if;

  -- Protokoll der Korrektur durch den Vorstand: nur Feldnamen, nie Werte.
  if p_corrected_by is not null then
    select coalesce(array_agg(k order by k), '{}') into v_fields
      from jsonb_object_keys(coalesce(p_plain, '{}'::jsonb)) as k;
    insert into public.member_data_corrections (profile_id, corrected_by, fields)
    values (p_profile_id, p_corrected_by, v_fields);
  end if;

  if p_iban_changed then
    insert into public.notification_events (type, profile_id, payload)
    values (
      'iban_changed',
      p_profile_id,
      jsonb_build_object(
        'profile_id',     p_profile_id,
        'vorname',        v_profile."Vorname",
        'nachname',       v_profile."Nachname",
        'email',          v_profile."E-Mail",
        'iban_last4',     p_iban_last4,
        'old_iban_last4', v_old_last4,
        'changed_at',     now(),
        'by_board',       p_corrected_by is not null
      )
    );
  end if;

  return v_version;
end;
$$;

revoke execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) Trigger der Übergangsphase
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_track_iban_change on public.profiles;
drop function if exists public.profiles_track_iban_change();

drop trigger if exists profiles_guard_sensitive_plain on public.profiles;
drop function if exists public.profiles_guard_sensitive_plain();

-- ---------------------------------------------------------------------------
-- 3) Registrierung: sensible Angaben nur verschlüsselt
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
  semester_number integer;
  sepa_confirmed  boolean;
  statute_accepted boolean;
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

  -- Neues Profil aus den Registrierungsdaten. Sensible Angaben kommen nur verschlüsselt
  -- (adopt_pending_secrets), nie als Klartext.
  meta := (coalesce(u.raw_user_meta_data, '{}'::jsonb)
           || coalesce((select r.data from public.pending_registrations r where r.user_id = u.id), '{}'::jsonb))
          - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];

  if (meta->>'Semester') ~ '^\d{1,2}$' then
    semester_number := (meta->>'Semester')::integer;
  end if;

  sepa_confirmed := lower(coalesce(meta->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');
  statute_accepted := lower(coalesce(meta->>'Vereinsatzung-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');

  insert into public.profiles (
    "id", "user_id", "E-Mail", "Status", "Rolle", "Datum_Antrag",
    "Vorname", "Nachname", "Studiengang / Fach", "Abschluss", "Semester", "Hochschulart",
    "Sepa-Bestätigung", "Datum_Mandat", "Vereinsatzung-Bestätigung"
  )
  values (
    u.id, u.id, u.email, 'active', 'member', current_date,
    left(meta->>'Vorname', 100),
    left(meta->>'Nachname', 100),
    left(meta->>'Fach', 150),
    left(meta->>'Abschluss', 150),
    semester_number,
    left(meta->>'Uni/OTH', 150),
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

    -- Nur nicht sensible Felder nachfüllen; sensible kommen verschlüsselt (finish_pending_registration).
    update public.profiles p
       set "Studiengang / Fach" = coalesce(nullif(p."Studiengang / Fach", ''), left(d->>'Fach', 150)),
           "Abschluss"          = coalesce(nullif(p."Abschluss", ''), left(d->>'Abschluss', 150)),
           "Semester"           = coalesce(p."Semester",
                                    case when (d->>'Semester') ~ '^\d{1,2}$' then (d->>'Semester')::integer end),
           "Hochschulart"       = coalesce(nullif(p."Hochschulart", ''), left(d->>'Uni/OTH', 150)),
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

-- Vergleich der Registrierungsangaben mit dem Profil: nur noch die nicht sensiblen Felder (die sensiblen
-- stehen nie im Profil und werden aus Metadaten und pending_registrations entfernt).
create or replace function public.registration_meta_is_redundant(p_meta jsonb, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
          (public.registration_norm(p_meta->>'Semester') is null
            or public.registration_norm(p_meta->>'Semester') = p."Semester"::text)
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

-- Offene Registrierung nur löschen, wenn GENAU ihre Chiffrate übernommen wurden (gleicher Datenschlüssel,
-- eigenes Profil id = user_id). Verknüpfte Altprofile (id ≠ user_id) werden nie automatisch gelöscht –
-- deren Chiffrate sind die einzige Kopie der neu eingegebenen Daten.
create or replace function public.finish_pending_registration(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.adopt_pending_secrets(p_user_id);

  delete from public.pending_registrations r
   using public.profiles p
   where r.user_id = p_user_id
     and p.user_id = p_user_id
     and p.id = r.user_id
     and public.registration_meta_is_redundant(r.data, p.id)
     and exists (select 1 from public.member_secrets ms
                  where ms.profile_id = r.user_id
                    and ms.wrapped_dek = r.secrets->>'wrapped_dek');
end;
$$;

revoke execute on function public.finish_pending_registration(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Konto-Metadaten: sensible Angaben nie im Klartext am Konto
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
  if jsonb_typeof(new.raw_user_meta_data) = 'object' then
    -- Sensible Angaben immer entfernen (sie stünden sonst im Klartext am Konto und im Session-Cookie).
    new.raw_user_meta_data := new.raw_user_meta_data
                              - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];
    -- Übrige Registrierungsangaben erst entfernen, wenn das Profil sie enthält.
    if new.raw_user_meta_data ?| public.registration_meta_keys() then
      select p.id into v_profile_id from public.profiles p where p.user_id = new.id;
      if v_profile_id is not null
         and public.registration_meta_is_redundant(new.raw_user_meta_data, v_profile_id) then
        new.raw_user_meta_data := new.raw_user_meta_data - public.registration_meta_keys();
      end if;
    end if;
  end if;
  return new;
exception
  -- Ein Login oder eine Registrierung darf nie an dieser Bereinigung scheitern.
  when others then
    raise warning 'strip_registration_meta: %', sqlstate;
    return new;
end;
$$;

revoke execute on function public.strip_registration_meta() from public, anon, authenticated;

create or replace trigger strip_registration_meta
  before insert or update on auth.users
  for each row
  execute function public.strip_registration_meta();
