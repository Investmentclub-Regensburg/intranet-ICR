-- Verschlüsselung Phase 2b: Korrektur durch den Vorstand (docs/verschluesselung.md)
--
--  1) member_data_corrections: Protokoll der Korrekturen durch den Vorstand – wer, wann, welche Felder
--     (nur Feldnamen, nie Werte). Nur Service Role.
--  2) save_member_secrets(): neuer Parameter p_corrected_by (Profil-ID des Vorstands, sonst null).
--     Bei Korrektur durch den Vorstand: Protokolleintrag, IBAN-Event mit by_board = true.
--     Geburtsdatum wird jetzt ebenfalls in den Klartext mitgeschrieben (nur der Vorstand ändert es),
--     damit Klartext und verschlüsselte Fassung bis Phase 3 übereinstimmen.
--     Die bisherige Fassung mit 8 Parametern wird ersetzt.
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Protokoll
-- ---------------------------------------------------------------------------
create table if not exists public.member_data_corrections (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  corrected_by uuid references public.profiles(id) on delete set null,
  fields       text[] not null,
  created_at   timestamptz not null default now()
);

comment on table public.member_data_corrections is
  'Korrekturen verschlüsselter Mitgliedsdaten durch den Vorstand (nur Feldnamen, keine Werte). Nur Service Role.';

create index if not exists member_data_corrections_profile_idx
  on public.member_data_corrections (profile_id, created_at desc);

alter table public.member_data_corrections enable row level security;
revoke all on public.member_data_corrections from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Speichern
-- ---------------------------------------------------------------------------
drop function if exists public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb);

-- Wie bisher (Migration 20261012120000), zusätzlich:
-- p_corrected_by: Profil-ID des Vorstandsmitglieds bei einer Korrektur im Admin-Bereich, sonst null.
-- p_plain darf jetzt auch 'geburtsdatum' enthalten (YYYY-MM-DD oder leer).
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
    select coalesce(array_agg(k order by k), '{}') into v_fields from jsonb_object_keys(pl) as k;
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
