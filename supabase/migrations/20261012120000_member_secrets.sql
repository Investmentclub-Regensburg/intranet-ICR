-- Verschlüsselung Phase 2a: verschlüsselte Mitgliedsdaten (docs/verschluesselung.md)
--
--  1) member_crypto_keys: registrierte Master Keys (Key-ID + Prüfwert). Die App verschlüsselt nur mit
--     einem hier eingetragenen Key (fail closed). Einträge je Umgebung von Hand, nie per Migration.
--  2) member_secrets: je Mitglied der verschlüsselte Datenschlüssel und die 8 verschlüsselten Felder
--     (IBAN, BIC, Geburtsdatum, Straße, Hausnummer, PLZ, Ort, Handynummer), Fingerabdruck und letzte
--     4 Stellen der IBAN. Nur Service Role. Der Datenschlüssel darf sich nur ohne gleichzeitige
--     Feldänderung ändern (Rotation) – nie gemischte Schlüssel in einer Zeile.
--  3) save_member_secrets(): Speichern mit optimistischer Sperre (version) und – in dieser Übergangsphase –
--     gleichzeitigem Schreiben der Klartextspalten in profiles (Dual Write). IBAN-Änderung entscheidet
--     die App (ibanChanged) und übergibt sie; die Funktion setzt iban_changed_at und das Event.
--  4) Schutz des Dual Write: Die 8 Klartextspalten eines Mitglieds mit member_secrets-Zeile lassen sich
--     nur noch über save_member_secrets ändern (sonst wäre die verschlüsselte Fassung veraltet und würde
--     beim nächsten Speichern die Änderung überschreiben). Änderungen am Klartext ohne member_secrets-Zeile
--     (Altbestand, Dashboard) meldet profiles_track_iban_change weiter als IBAN-Änderung; Speichern über
--     save_member_secrets überspringt ihn (dort entscheidet die App).
--  5) Registrierung: pending_registrations.secrets (Chiffrate). Bei der Bestätigung übernimmt die
--     Datenbank den GANZEN Satz in member_secrets – nur für neu angelegte Profile (id = user_id), nie
--     entschlüsselt. Ein Fehler dabei blockiert die Bestätigung nicht; der Eintrag bleibt dann liegen.
--
-- Klartextspalten in profiles bleiben in dieser Phase befüllt (Leeren erst in Phase 3).
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Registrierte Master Keys
-- ---------------------------------------------------------------------------
create table if not exists public.member_crypto_keys (
  key_id     text primary key check (key_id ~ '^[a-z0-9-]{1,32}$'),
  kcv        text not null check (kcv ~ '^[0-9a-f]{16}$'),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

comment on table public.member_crypto_keys is
  'Registrierte Master Keys (ID + Prüfwert) für die Verschlüsselung der Mitgliedsdaten. Je Umgebung von Hand pflegen.';

alter table public.member_crypto_keys enable row level security;
revoke all on public.member_crypto_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Verschlüsselte Mitgliedsdaten
-- ---------------------------------------------------------------------------
create table if not exists public.member_secrets (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  wrapped_dek  text not null check (wrapped_dek ~ '^w2\.[a-z0-9-]{1,32}\.[0-9a-f]{16}\.[A-Za-z0-9_-]+$'),
  iban         text check (iban is null or iban ~ '^e1\.[A-Za-z0-9_-]+$'),
  bic          text check (bic is null or bic ~ '^e1\.[A-Za-z0-9_-]+$'),
  geburtsdatum text check (geburtsdatum is null or geburtsdatum ~ '^e1\.[A-Za-z0-9_-]+$'),
  strasse      text check (strasse is null or strasse ~ '^e1\.[A-Za-z0-9_-]+$'),
  hausnummer   text check (hausnummer is null or hausnummer ~ '^e1\.[A-Za-z0-9_-]+$'),
  plz          text check (plz is null or plz ~ '^e1\.[A-Za-z0-9_-]+$'),
  ort          text check (ort is null or ort ~ '^e1\.[A-Za-z0-9_-]+$'),
  handynummer  text check (handynummer is null or handynummer ~ '^e1\.[A-Za-z0-9_-]+$'),
  iban_hash    text check (iban_hash is null or iban_hash ~ '^h1\.[a-z0-9-]{1,32}\.[0-9a-f]{64}$'),
  iban_last4   text check (iban_last4 is null or iban_last4 ~ '^[A-Z0-9]{4}$'),
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.member_secrets is
  'Verschlüsselte Mitgliedsdaten (lib/member-crypto.ts). Nur Service Role.';

alter table public.member_secrets enable row level security;
revoke all on public.member_secrets from anon, authenticated;

create or replace function public.member_secrets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_id is distinct from old.profile_id then
    raise exception 'member_secrets: profile_id ist unveränderlich';
  end if;
  -- Neuer Datenschlüssel nur bei unveränderten Feldern (Rotation/Rewrap), nie zusammen mit neuen Werten.
  if new.wrapped_dek is distinct from old.wrapped_dek
     and (new.iban, new.bic, new.geburtsdatum, new.strasse, new.hausnummer, new.plz, new.ort, new.handynummer)
         is distinct from
         (old.iban, old.bic, old.geburtsdatum, old.strasse, old.hausnummer, old.plz, old.ort, old.handynummer) then
    raise exception 'member_secrets: Datenschlüssel und Felder dürfen nicht gleichzeitig geändert werden';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke execute on function public.member_secrets_guard() from public, anon, authenticated;

drop trigger if exists member_secrets_guard on public.member_secrets;
create trigger member_secrets_guard
  before update on public.member_secrets
  for each row
  execute function public.member_secrets_guard();

-- ---------------------------------------------------------------------------
-- 3) Speichern (Server Action → RPC, nur Service Role)
-- ---------------------------------------------------------------------------
-- p_expected_version: null = neue Zeile anlegen (scheitert, wenn es schon eine gibt), sonst die zuletzt
-- gelesene Version (scheitert, wenn inzwischen jemand anderes gespeichert hat). p_wrapped_dek muss beim
-- Ändern dem gespeicherten entsprechen. p_secrets: alle 8 Felder (null = leer). p_plain: Klartextwerte
-- für profiles (nur enthaltene Schlüssel; Geburtsdatum wird hier nie geschrieben).
-- Rückgabe: neue Version. Konflikt → Fehler 'member_secrets_conflict' (App liest neu und versucht erneut).
create or replace function public.save_member_secrets(
  p_profile_id       uuid,
  p_expected_version integer,
  p_wrapped_dek      text,
  p_secrets          jsonb,
  p_iban_hash        text,
  p_iban_last4       text,
  p_iban_changed     boolean,
  p_plain            jsonb
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
  s            jsonb := coalesce(p_secrets, '{}'::jsonb);
  pl           jsonb := coalesce(p_plain, '{}'::jsonb);
begin
  -- Alle 8 Felder müssen übergeben werden (fehlende würden sonst still geleert).
  if not (s ?& array['iban', 'bic', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'ort', 'handynummer']) then
    raise exception 'member_secrets: p_secrets muss alle 8 Felder enthalten';
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

  -- Übergangsphase: Klartext in profiles weiter mitschreiben (nur übergebene Felder).
  update public.profiles p
     set "Straße"      = case when pl ? 'strasse'     then pl->>'strasse'     else p."Straße" end,
         "Hausnummer"  = case when pl ? 'hausnummer'  then pl->>'hausnummer'  else p."Hausnummer" end,
         "PLZ"         = case when pl ? 'plz'         then pl->>'plz'         else p."PLZ" end,
         "Ort"         = case when pl ? 'ort'         then pl->>'ort'         else p."Ort" end,
         "Handynummer" = case when pl ? 'handynummer' then pl->>'handynummer' else p."Handynummer" end,
         "IBAN"        = case when pl ? 'iban'        then pl->>'iban'        else p."IBAN" end,
         "BIC"         = case when pl ? 'bic'         then pl->>'bic'         else p."BIC" end,
         iban_changed_at = case when p_iban_changed then now() else p.iban_changed_at end
   where p.id = p_profile_id;

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
        'changed_at',     now()
      )
    );
  end if;

  -- Kennzeichen zurücksetzen: gilt nur für die Schreibvorgänge dieser Funktion.
  perform set_config('app.member_secrets_write', '', true);
  return v_version;
end;
$$;

revoke execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4) Schutz des Dual Write
-- ---------------------------------------------------------------------------
-- Bisheriger IBAN-Trigger bleibt für Änderungen außerhalb von save_member_secrets (Altbestand ohne
-- member_secrets-Zeile, Dashboard); beim Speichern über die App entscheidet die App.
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
  if current_setting('app.member_secrets_write', true) = 'on' then
    return new;
  end if;
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

-- Klartext eines Mitglieds mit member_secrets-Zeile nur über save_member_secrets ändern.
create or replace function public.profiles_guard_sensitive_plain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.member_secrets_write', true) = 'on' then
    return new;
  end if;
  if (new."IBAN", new."BIC", new."Geburtsdatum", new."Straße", new."Hausnummer", new."PLZ", new."Ort", new."Handynummer")
     is distinct from
     (old."IBAN", old."BIC", old."Geburtsdatum", old."Straße", old."Hausnummer", old."PLZ", old."Ort", old."Handynummer")
     and exists (select 1 from public.member_secrets ms where ms.profile_id = new.id) then
    raise exception 'Sensible Felder dieses Mitglieds sind verschlüsselt – Änderung nur über das Intranet (Profil)';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_guard_sensitive_plain() from public, anon, authenticated;

drop trigger if exists profiles_guard_sensitive_plain on public.profiles;
create trigger profiles_guard_sensitive_plain
  before update of "IBAN", "BIC", "Geburtsdatum", "Straße", "Hausnummer", "PLZ", "Ort", "Handynummer"
  on public.profiles
  for each row
  execute function public.profiles_guard_sensitive_plain();

-- ---------------------------------------------------------------------------
-- 5) Registrierung: Chiffrate aus pending_registrations übernehmen
-- ---------------------------------------------------------------------------
alter table public.pending_registrations add column if not exists secrets jsonb;

comment on column public.pending_registrations.secrets is
  'Chiffrate der Registrierung: {wrapped_dek, fields:{iban,…}, iban_hash, iban_last4} (für Mitglieds-ID = user_id).';

-- Ganzen Satz übernehmen oder gar nichts; nur für neu angelegte Profile (id = user_id); nie eine
-- vorhandene Zeile überschreiben. Fehler blockieren die Bestätigung nicht.
create or replace function public.adopt_pending_secrets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_secrets (
    profile_id, wrapped_dek, iban, bic, geburtsdatum, strasse, hausnummer, plz, ort, handynummer,
    iban_hash, iban_last4
  )
  select p.id,
         r.secrets->>'wrapped_dek',
         r.secrets->'fields'->>'iban',
         r.secrets->'fields'->>'bic',
         r.secrets->'fields'->>'geburtsdatum',
         r.secrets->'fields'->>'strasse',
         r.secrets->'fields'->>'hausnummer',
         r.secrets->'fields'->>'plz',
         r.secrets->'fields'->>'ort',
         r.secrets->'fields'->>'handynummer',
         r.secrets->>'iban_hash',
         r.secrets->>'iban_last4'
    from public.pending_registrations r
    join public.profiles p on p.id = r.user_id and p.user_id = r.user_id
   where r.user_id = p_user_id
     and r.secrets is not null
  on conflict (profile_id) do nothing;
exception
  when others then
    raise warning 'adopt_pending_secrets: % – Eintrag bleibt in pending_registrations', sqlstate;
end;
$$;

revoke execute on function public.adopt_pending_secrets(uuid) from public, anon, authenticated;

-- Eintrag nur löschen, wenn das Profil alle Klartextangaben enthält UND (falls Chiffrate vorhanden) für
-- das Profil eine member_secrets-Zeile existiert (übernommen oder schon vorher vorhanden – eine
-- vorhandene Zeile wird nie überschrieben, die Daten stehen dann im Klartext des Profils).
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
       or exists (select 1 from public.member_secrets ms where ms.profile_id = p.id)
     );
end;
$$;

revoke execute on function public.finish_pending_registration(uuid) from public, anon, authenticated;

-- Nachfüllen ohne E-Mail-Bestätigung: nur, solange es keine member_secrets-Zeile gibt (sonst wäre der
-- Klartext anders als die verschlüsselte Fassung; der Schutz-Trigger würde die Bestätigung abbrechen).
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
       and p."Datum_Antrag" = current_date
       and not exists (select 1 from public.member_secrets ms where ms.profile_id = p.id);

    perform public.finish_pending_registration(new.user_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.handle_pending_registration() from public, anon, authenticated;
