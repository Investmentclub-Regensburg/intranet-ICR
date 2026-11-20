-- Eine E-Mail-Adresse nur einmal – ohne Groß-/Kleinschreibung (Entscheidung Hannes 20.11.2026)
--
-- Bisher: Unique-Constraint "profiles_Email_key" auf "E-Mail" (unterscheidet Groß-/Kleinschreibung). Er hat die
-- Doppelprofile vom Februar 2026 nicht verhindert (Import „Max.Muster@…“, Konto „max.muster@…“).
-- Neu: Unique-Index auf lower(btrim("E-Mail")) – derselbe Vergleich wie provision_profile_for_auth_user und die
-- Erkennung in scripts/lib/doppelprofile.mjs. Er ist strenger als der alte, deshalb fällt der alte weg.
--
-- REIHENFOLGE (eigener PR feat/email-index): Diese Migration erst NACH dem Zusammenführen (npm run doppelprofile -- zusammenfuehren …)
-- einspielen. Gibt es noch Adressen mehrfach, bricht sie mit einer Meldung ab und ändert nichts (psql -1).
--
-- Folgen im Betrieb (geprüft):
--  * sync_profile_email_from_auth fängt unique_violation ab → eine E-Mail-Änderung auf die Adresse eines anderen
--    Profils (auch in anderer Schreibweise) lässt das Profil unverändert, wie bisher bei exakt gleicher Adresse.
--  * requestEmailChange prüft vorher schon ohne Groß-/Kleinschreibung (ilike).
--  * idx_profiles_email (nicht eindeutig, für .eq("E-Mail", …)) bleibt.
-- Idempotent.

do $$
declare
  v_doppelt integer;
begin
  select count(*) into v_doppelt
    from (
      select 1
        from public.profiles p
       group by lower(btrim(p."E-Mail"))
      having count(*) > 1
    ) d;
  if v_doppelt > 0 then
    raise exception 'profiles: % E-Mail-Adressen kommen mehrfach vor (ohne Groß-/Kleinschreibung). Erst die Doppelprofile zusammenführen bzw. vom Vorstand klären lassen (npm run doppelprofile -- pruefen), dann diese Migration erneut einspielen. Es wurde nichts geändert.', v_doppelt;
  end if;
end;
$$;

create unique index if not exists profiles_email_lower_key on public.profiles (lower(btrim("E-Mail")));

alter table public.profiles drop constraint if exists "profiles_Email_key";
