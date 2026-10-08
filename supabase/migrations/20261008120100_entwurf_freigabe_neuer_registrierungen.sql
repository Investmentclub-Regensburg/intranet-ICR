-- ENTWURF – vor Ausführung gegen Schema-Dump prüfen
--
-- Neue Registrierungen erst nach Freigabe durch den Vorstand
--
-- Voraussetzung: Entwurf 20261008120000_entwurf_profil_verknuepfung_nach_bestaetigung.sql
-- ist ausgeführt (dort entstehen neue Profile über provision_profile_for_auth_user()).
--
-- Wirkung: Neue Profile aus der Selbstregistrierung bekommen Status 'applicant' (Antrag offen)
-- statt 'active'. Die App lässt Profile mit Status 'applicant' nicht ins Intranet (Middleware,
-- getCachedAuth, Login-Meldung "Antrag wird vom Vorstand geprüft"). Bestehende Profile ändern
-- sich nicht.
--
-- Freigabe heute schon möglich: Admin → Mitglieder → Rolle auswählen (updateMemberRole setzt
-- dabei Status = 'active'). Die Vorstandsmail "Neue Registrierung" kommt wie bisher.
--
-- Nicht gebaut (UI-Vorschlag): eigene Liste "Offene Anträge" für den Vorstand
--   * Kachel im Admin-Bereich mit Anzahl der Profile mit Status 'applicant'
--   * je Antrag Name, Studiengang, Antragsdatum, E-Mail bestätigt ja/nein
--   * Aktionen "Freigeben" (Status 'active', Rolle 'member') und "Ablehnen"
--     (Status 'cancelled' bzw. Profil löschen, Auth-Konto sperren) – nur Rolle board
--   * Mail an das Mitglied bei Freigabe (neuer Outbox-Typ, analog alumni_decided)
--
-- Vor der Ausführung prüfen:
--   * 'applicant' ist ein zulässiger Wert für profiles."Status" (Enum/Check-Constraint).
--   * Wie viele Profile haben heute schon Status 'applicant' und ein verknüpftes Konto?
--       select count(*) from public.profiles where lower("Status"::text) = 'applicant' and user_id is not null;
--     Diese Konten haben mit der App-Änderung keinen Intranet-Zugang mehr.
--   * Texte der Registrierungsseite anpassen ("Danach prüft der Vorstand deinen Antrag").
--
-- Ausführen: wie Entwurf 20261008120000 (Zeile "set icr.apply_drafts = on;" voranstellen).
-- Rückgängig: registrations_require_approval() wieder "select false" zurückgeben lassen.

do $$
begin
  if coalesce(current_setting('icr.apply_drafts', true), '') <> 'on' then
    raise exception 'ENTWURF – vor Ausführung gegen Schema-Dump prüfen (set icr.apply_drafts = on)';
  end if;
end $$;

create or replace function public.registrations_require_approval()
returns boolean
language sql
stable
set search_path = ''
as $$
  select true
$$;

revoke execute on function public.registrations_require_approval() from public, anon, authenticated;
