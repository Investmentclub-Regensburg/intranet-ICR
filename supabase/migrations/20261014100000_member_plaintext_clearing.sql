-- Verschlüsselung Phase 3b: Klartext leeren (docs/verschluesselung.md)
--
-- Ablauf in der Produktion (Verwaltung → Verschlüsselung):
--   1. Backfill + Prüflauf (Phase 3a).
--   2. clear_member_plaintext(): je Profil die 8 Klartextspalten leeren – nur mit member_secrets-Zeile und
--      nur, wenn der Klartext noch dem Stand entspricht, den die App entschlüsselt und verglichen hat.
--   3. finish_plain_clearing(): nur wenn kein Profil mehr sensiblen Klartext hat. Setzt den Endzustand
--      (member_crypto_state.plain_cleared_at). Ab dann:
--        * save_member_secrets schreibt keinen Klartext mehr mit,
--        * Registrierung legt keine sensiblen Klartextwerte mehr an (Profil und pending_registrations),
--        * profiles_block_sensitive_plain weist jeden neuen sensiblen Klartextwert ab (auch alte Deployments,
--          Dashboard, SQL).
--   Bis zu Schritt 3 gilt alles wie in Phase 2b (Dual Write), damit der Prüflauf exakt vergleichen kann.
--
-- Außerdem: Mail „Neues Mitglied“ ohne Ort (verschlüsseltes Feld), Ort aus gespeicherten Payloads entfernt.
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Zustand
-- ---------------------------------------------------------------------------
create table if not exists public.member_crypto_state (
  id               boolean primary key default true check (id),
  plain_cleared_at timestamptz
);

comment on table public.member_crypto_state is
  'Endzustand der Verschlüsselung: plain_cleared_at gesetzt = Klartext geleert, keine Klartext-Schreibvorgänge mehr. Nur Service Role.';

insert into public.member_crypto_state (id) values (true) on conflict (id) do nothing;

alter table public.member_crypto_state enable row level security;
revoke all on public.member_crypto_state from anon, authenticated;

create or replace function public.member_plain_cleared()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.plain_cleared_at is not null from public.member_crypto_state s where s.id), false);
$$;

revoke execute on function public.member_plain_cleared() from public, anon, authenticated;

alter table public.member_secrets add column if not exists plain_cleared_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) Speichern: kein Dual Write mehr im Endzustand
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
  pl           jsonb := coalesce(p_plain, '{}'::jsonb);
  -- Für Protokoll und Klartext: welche Felder die App geändert hat.
  v_changed    jsonb := coalesce(p_plain, '{}'::jsonb);
begin
  -- Alle 8 Felder müssen übergeben werden (fehlende würden sonst still geleert).
  if not (s ?& array['iban', 'bic', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'ort', 'handynummer']) then
    raise exception 'member_secrets: p_secrets muss alle 8 Felder enthalten';
  end if;
  -- Endzustand oder Profil bereits geleert: keinen Klartext mehr mitschreiben (sonst stünde nur ein Teil
  -- der Felder wieder im Klartext).
  if public.member_plain_cleared()
     or exists (select 1 from public.member_secrets ms
                 where ms.profile_id = p_profile_id and ms.plain_cleared_at is not null) then
    pl := '{}'::jsonb;
  end if;
  -- Kennzeichen für die Trigger auf profiles: Schreiben über diese Funktion (nur diese Transaktion).
  perform set_config('app.member_secrets_write', 'on', true);

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'member_secrets: Profil % nicht gefunden', p_profile_id;
  end if;

  select ms.iban_last4 into v_old_last4 from public.member_secrets ms where ms.profile_id = p_profile_id;
  if v_old_last4 is null then
    v_old_last4 := nullif(right(upper(regexp_replace(coalesce(v_profile."IBAN", ''), '[^A-Za-z0-9]', '', 'g')), 4), '');
  end if;

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

  -- Übergangsphase: Klartext in profiles weiter mitschreiben (nur übergebene Felder; im Endzustand keine).
  update public.profiles p
     set "Straße"       = case when pl ? 'strasse'      then pl->>'strasse'      else p."Straße" end,
         "Hausnummer"   = case when pl ? 'hausnummer'   then pl->>'hausnummer'   else p."Hausnummer" end,
         "PLZ"          = case when pl ? 'plz'          then pl->>'plz'          else p."PLZ" end,
         "Ort"          = case when pl ? 'ort'          then pl->>'ort'          else p."Ort" end,
         "Handynummer"  = case when pl ? 'handynummer'  then pl->>'handynummer'  else p."Handynummer" end,
         "IBAN"         = case when pl ? 'iban'         then pl->>'iban'         else p."IBAN" end,
         "BIC"          = case when pl ? 'bic'          then pl->>'bic'          else p."BIC" end,
         "Geburtsdatum" = case when pl ? 'geburtsdatum'
                               then nullif(pl->>'geburtsdatum', '')::date
                               else p."Geburtsdatum" end,
         iban_changed_at = case when p_iban_changed then now() else p.iban_changed_at end
   where p.id = p_profile_id;

  if p_corrected_by is not null then
    select coalesce(array_agg(k order by k), '{}') into v_fields from jsonb_object_keys(v_changed) as k;
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

  -- Kennzeichen zurücksetzen: gilt nur für die Schreibvorgänge dieser Funktion.
  perform set_config('app.member_secrets_write', '', true);
  return v_version;
end;
$$;

revoke execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3) Registrierung im Endzustand ohne sensiblen Klartext
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
                                  or lower(coalesce(d->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on')
     where p.user_id = new.user_id
       and p.id = new.user_id
       and p."Datum_Antrag" = current_date
       and not exists (select 1 from public.member_secrets ms where ms.profile_id = p.id);

    perform public.finish_pending_registration(new.user_id);
  end if;
  return null;
end;
$$;

-- Offene Registrierung nur löschen, wenn nichts verloren geht: ohne Chiffrate wie bisher (Klartext im Profil
-- vollständig), mit Chiffraten nur, wenn GENAU diese übernommen wurden (gleicher Datenschlüssel, eigenes
-- Profil id = user_id). Verknüpfte Altprofile (id ≠ user_id) werden nie automatisch gelöscht – deren
-- Chiffrate sind die einzige Kopie der neu eingegebenen Daten.
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
     and public.registration_meta_is_redundant(r.data, p.id)
     and (
       r.secrets is null
       or (p.id = r.user_id
           and exists (select 1 from public.member_secrets ms
                        where ms.profile_id = r.user_id
                          and ms.wrapped_dek = r.secrets->>'wrapped_dek'))
     );
end;
$$;

revoke execute on function public.finish_pending_registration(uuid) from public, anon, authenticated;

-- Endzustand: Registrierungsdaten nur mit Chiffraten annehmen und ohne sensiblen Klartext ablegen.
create or replace function public.pending_registrations_strip_plain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.member_plain_cleared() then
    if new.secrets is null then
      raise exception 'Registrierung ohne Verschlüsselung nicht möglich (Master Key fehlt oder ist nicht registriert)';
    end if;
    new.data := coalesce(new.data, '{}'::jsonb)
              - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];
  end if;
  return new;
end;
$$;

revoke execute on function public.pending_registrations_strip_plain() from public, anon, authenticated;

drop trigger if exists pending_registrations_strip_plain on public.pending_registrations;
create trigger pending_registrations_strip_plain
  before insert or update of data, secrets on public.pending_registrations
  for each row
  execute function public.pending_registrations_strip_plain();

-- ---------------------------------------------------------------------------
-- 4) Sperre im Endzustand: keine sensiblen Klartextwerte mehr in profiles
-- ---------------------------------------------------------------------------
create or replace function public.profiles_block_sensitive_plain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.member_plain_cleared() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Neues Profil (Registrierung): sensible Angaben kommen nur verschlüsselt; Klartext verwerfen statt die
    -- E-Mail-Bestätigung scheitern zu lassen.
    new."IBAN" := null; new."BIC" := null; new."Geburtsdatum" := null; new."Straße" := null;
    new."Hausnummer" := null; new."PLZ" := null; new."Ort" := null; new."Handynummer" := null;
    return new;
  end if;
  if coalesce(new."IBAN", '') <> '' or coalesce(new."BIC", '') <> '' or new."Geburtsdatum" is not null
     or coalesce(new."Straße", '') <> '' or coalesce(new."Hausnummer", '') <> '' or coalesce(new."PLZ", '') <> ''
     or coalesce(new."Ort", '') <> '' or coalesce(new."Handynummer", '') <> '' then
    raise exception 'Sensible Felder werden nur noch verschlüsselt gespeichert (docs/verschluesselung.md)';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_block_sensitive_plain() from public, anon, authenticated;

drop trigger if exists profiles_block_sensitive_plain on public.profiles;
create trigger profiles_block_sensitive_plain
  before insert or update of "IBAN", "BIC", "Geburtsdatum", "Straße", "Hausnummer", "PLZ", "Ort", "Handynummer"
  on public.profiles
  for each row
  execute function public.profiles_block_sensitive_plain();

-- ---------------------------------------------------------------------------
-- 5) Mail „Neues Mitglied“ ohne Ort
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
      'datum_antrag', new."Datum_Antrag",
      'status',       new."Status",
      'rolle',        new."Rolle"
    )
  );
  return new;
end;
$$;

update public.notification_events
   set payload = payload - 'ort'
 where type = 'member_registered'
   and payload ? 'ort';

-- ---------------------------------------------------------------------------
-- 6) Klartext eines Profils leeren (App → RPC, nur Service Role)
-- ---------------------------------------------------------------------------
-- p_expected: die 8 Klartextwerte, wie die App sie gelesen, entschlüsselt verglichen und für gleich
-- befunden hat (Schlüssel iban, bic, geburtsdatum YYYY-MM-DD, strasse, hausnummer, plz, ort, handynummer;
-- null = leer); p_expected_version: Version der dabei entschlüsselten member_secrets-Zeile. Weicht Klartext
-- oder Zeile inzwischen ab, wird nichts geleert ('member_plain_changed').
create or replace function public.clear_member_plaintext(p_profile_id uuid, p_expected jsonb, p_expected_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p          public.profiles%rowtype;
  e          jsonb := coalesce(p_expected, '{}'::jsonb);
  v_version  integer;
begin
  if not (e ?& array['iban', 'bic', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'ort', 'handynummer']) then
    raise exception 'clear_member_plaintext: p_expected muss alle 8 Felder enthalten';
  end if;

  select * into p from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'clear_member_plaintext: Profil % nicht gefunden', p_profile_id;
  end if;
  select ms.version into v_version from public.member_secrets ms where ms.profile_id = p_profile_id for update;
  if not found then
    raise exception 'clear_member_plaintext: keine member_secrets-Zeile – nie ohne verschlüsselte Fassung leeren';
  end if;
  if v_version is distinct from p_expected_version then
    raise exception 'member_plain_changed';
  end if;

  if coalesce(p."IBAN", '')        is distinct from coalesce(e->>'iban', '')
     or coalesce(p."BIC", '')        is distinct from coalesce(e->>'bic', '')
     or coalesce(to_char(p."Geburtsdatum", 'YYYY-MM-DD'), '') is distinct from coalesce(e->>'geburtsdatum', '')
     or coalesce(p."Straße", '')     is distinct from coalesce(e->>'strasse', '')
     or coalesce(p."Hausnummer", '') is distinct from coalesce(e->>'hausnummer', '')
     or coalesce(p."PLZ", '')        is distinct from coalesce(e->>'plz', '')
     or coalesce(p."Ort", '')        is distinct from coalesce(e->>'ort', '')
     or coalesce(p."Handynummer", '') is distinct from coalesce(e->>'handynummer', '') then
    raise exception 'member_plain_changed';
  end if;

  perform set_config('app.member_secrets_write', 'on', true);
  update public.profiles
     set "IBAN" = null, "BIC" = null, "Geburtsdatum" = null, "Straße" = null, "Hausnummer" = null,
         "PLZ" = null, "Ort" = null, "Handynummer" = null
   where id = p_profile_id;
  update public.member_secrets set plain_cleared_at = now() where profile_id = p_profile_id;
  -- Übernommene Registrierung: Klartext-Kopie in pending_registrations ebenfalls entfernen.
  update public.pending_registrations r
     set data = r.data - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer']
   where r.user_id = p_profile_id
     and r.data ?| array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer']
     and exists (select 1 from public.member_secrets ms
                  where ms.profile_id = p_profile_id and ms.wrapped_dek = r.secrets->>'wrapped_dek');
  perform set_config('app.member_secrets_write', '', true);
end;
$$;

drop function if exists public.clear_member_plaintext(uuid, jsonb);
revoke execute on function public.clear_member_plaintext(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.clear_member_plaintext(uuid, jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 7) Reste und Abschließen (App → RPC, nur Service Role)
-- ---------------------------------------------------------------------------
-- Was das Abschließen blockiert bzw. was der Vorstand wissen muss (nur IDs, keine Werte).
create or replace function public.member_plain_leftovers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- Konten mit sensiblen Registrierungsangaben in den Metadaten (blockiert).
    'auth_meta', coalesce((
      select jsonb_agg(u.id order by u.id) from auth.users u
       where u.raw_user_meta_data ?| array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer']
    ), '[]'::jsonb),
    -- Offene Registrierungen nur mit Klartext (blockiert).
    'pending_plain_only', coalesce((
      select jsonb_agg(r.user_id order by r.user_id) from public.pending_registrations r
       where r.secrets is null
         and r.data ?| array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer']
    ), '[]'::jsonb),
    -- Offene Registrierungen mit Chiffraten, die (noch) nicht übernommen sind (z. B. verknüpftes Altprofil).
    'pending_unadopted', coalesce((
      select jsonb_agg(r.user_id order by r.user_id) from public.pending_registrations r
       where r.secrets is not null
         and not exists (select 1 from public.member_secrets ms
                          where ms.profile_id = r.user_id and ms.wrapped_dek = r.secrets->>'wrapped_dek')
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.member_plain_leftovers() from public, anon, authenticated;
grant execute on function public.member_plain_leftovers() to service_role;

-- Nur wenn kein Profil mehr sensiblen Klartext hat (jeder nicht leere Wert zählt), keine offene Registrierung
-- nur Klartext trägt und keine Konto-Metadaten sensible Angaben enthalten. Sperrt pending_registrations und
-- profiles (Reihenfolge wie die Registrierungs-Trigger) bis zum Ende der Transaktion gegen Schreibvorgänge.
create or replace function public.finish_plain_clearing()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plain    integer;
  v_left     jsonb;
  v_stripped integer;
begin
  if public.member_plain_cleared() then
    return jsonb_build_object('already', true);
  end if;
  set local lock_timeout = '5s';
  lock table public.pending_registrations in share row exclusive mode;
  lock table public.profiles in share mode;

  select count(*) into v_plain
    from public.profiles p
   where coalesce(p."IBAN", '') <> '' or coalesce(p."BIC", '') <> '' or p."Geburtsdatum" is not null
      or coalesce(p."Straße", '') <> '' or coalesce(p."Hausnummer", '') <> '' or coalesce(p."PLZ", '') <> ''
      or coalesce(p."Ort", '') <> '' or coalesce(p."Handynummer", '') <> '';
  if v_plain > 0 then
    raise exception 'finish_plain_clearing: % Profile haben noch Klartext', v_plain;
  end if;

  v_left := public.member_plain_leftovers();
  if jsonb_array_length(v_left->'pending_plain_only') > 0 then
    raise exception 'finish_plain_clearing: % offene Registrierungen nur mit Klartext',
      jsonb_array_length(v_left->'pending_plain_only');
  end if;
  if jsonb_array_length(v_left->'auth_meta') > 0 then
    raise exception 'finish_plain_clearing: % Konten mit sensiblen Angaben in den Metadaten',
      jsonb_array_length(v_left->'auth_meta');
  end if;

  -- Klartext-Kopien in offenen Registrierungen mit Chiffraten entfernen (die Chiffrate enthalten alle Felder).
  update public.pending_registrations r
     set data = r.data - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer']
   where r.secrets is not null
     and r.data ?| array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];
  get diagnostics v_stripped = row_count;

  update public.notification_events
     set payload = payload - 'ort'
   where type = 'member_registered'
     and payload ? 'ort';

  update public.member_crypto_state set plain_cleared_at = now() where id;
  return jsonb_build_object('already', false, 'pending_stripped', v_stripped);
end;
$$;

revoke execute on function public.finish_plain_clearing() from public, anon, authenticated;
grant execute on function public.finish_plain_clearing() to service_role;
