-- Mitgliederdaten: Bestätigung „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4)
--
-- profiles.daten_bestaetigt_am: wann das Mitglied seine Daten zuletzt bestätigt (oder bei der Registrierung
--   nach den aktuellen Regeln eingegeben) hat. Leer = noch nie → die Abfrage ist fällig, sobald sie
--   eingeschaltet ist (DATA_CHECK_ENABLED). Stichtage 1.3./15.9. stehen im Code (lib/member-data-check.ts).
-- profiles.daten_erinnern_ab: „Später“ im Abfrage-Fenster; bis dahin wird nicht gefragt. Leer = sofort.
--
-- Rechte: unverändert. Mitglieder lesen nur die eigene Zeile (Policy „profiles: eigene Zeile lesen“) und haben
-- weder eine Update-Policy noch ein UPDATE-Recht auf profiles; geschrieben wird nur über die Server-Action mit
-- Service Role. Die Spalten berühren keinen Trigger auf profiles (alle sind auf andere Spalten beschränkt:
-- Klartext-Sperre, IBAN, Status, Rolle, user_id; die E-Mail-Synchronisierung schreibt nur "E-Mail").
--
-- Registrierung: Wer sich neu registriert, hat die Daten gerade nach den aktuellen Regeln eingegeben.
-- adopt_pending_secrets setzt deshalb daten_bestaetigt_am, sobald die verschlüsselten Registrierungsdaten ins
-- neue Profil übernommen wurden. Ein mit einem Altprofil verknüpftes Konto (id ≠ user_id) und eine
-- Registrierung ohne übernommene Daten bleiben leer und werden gefragt.
--
-- Nichts für anon, keine Funktion neu freigegeben. Nur additiv, idempotent.

-- ---------------------------------------------------------------------------
-- 1) Spalten (ohne Standardwert: Bestand bleibt leer = fällig, Entscheidung 9 „Start sofort“)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists daten_bestaetigt_am timestamptz,
  add column if not exists daten_erinnern_ab timestamptz;

comment on column public.profiles.daten_bestaetigt_am is
  'Daten zuletzt bestätigt (Abfrage „Stimmen deine Daten noch?“ oder Registrierung). Leer = nie.';
comment on column public.profiles.daten_erinnern_ab is
  '„Später“ im Abfrage-Fenster: vorher nicht erneut fragen. Leer = sofort.';

-- Ausdrücklich: kein Schreibrecht für anon/authenticated (es gibt auch kein Tabellenrecht; zur Sicherheit,
-- falls je eines vergeben wird).
revoke insert (daten_bestaetigt_am, daten_erinnern_ab), update (daten_bestaetigt_am, daten_erinnern_ab)
  on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Registrierung: Bestätigung beim Übernehmen der Registrierungsdaten
--    (Fassung aus 20261118120000_member_secrets_land.sql, nur der Zeitstempel ist neu)
-- ---------------------------------------------------------------------------
create or replace function public.adopt_pending_secrets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.member_secrets (
    profile_id, wrapped_dek, iban, bic, geburtsdatum, strasse, hausnummer, plz, ort, handynummer, land,
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
         r.secrets->'fields'->>'land',
         r.secrets->>'iban_hash',
         r.secrets->>'iban_last4'
    from public.pending_registrations r
    join public.profiles p on p.id = r.user_id and p.user_id = r.user_id
   where r.user_id = p_user_id
     and r.secrets is not null
  on conflict (profile_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    -- Neues Profil mit gerade eingegebenen Daten: gilt als bestätigt (nicht sofort erneut fragen).
    update public.profiles p
       set daten_bestaetigt_am = now()
     where p.id = p_user_id
       and p.user_id = p_user_id
       and p.daten_bestaetigt_am is null;
  end if;
exception
  when others then
    raise warning 'adopt_pending_secrets: % – Eintrag bleibt in pending_registrations', sqlstate;
end;
$$;

revoke execute on function public.adopt_pending_secrets(uuid) from public, anon, authenticated;
