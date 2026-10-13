-- Öffentliche Termine für investmentclubregensburg.com (Funktion public.website_events()).
--
-- Nachtrag: Die Funktion wurde am 13.10.2026 direkt in der Produktion angelegt (Fassung 3, Entscheidung des
-- Vereins). Diese Migration bildet genau diesen Stand im Repo ab, damit Test-Projekt, Migrationsverlauf und
-- Produktion übereinstimmen. In der Produktion ändert sie nichts (gleiche Definition, gleiche Rechte).
--
-- Die Website (Container auf dem Vereinsserver) ruft POST /rest/v1/rpc/website_events mit dem öffentlichen
-- Schlüssel auf und speichert das Ergebnis kurz zwischen; Besucher verbinden sich nie selbst mit Supabase.
--
-- Öffentlich sind nur: Titel, Datum, Uhrzeiten, Ort, Veranstalter und ob eine Anmeldung (im Intranet, nur
-- Mitglieder) nötig ist. Keine Beschreibung und kein Flyer (dort stehen teils Anmeldelinks).
--
-- Sicherheit: SECURITY DEFINER mit fester Spaltenliste. anon darf nur diese Funktion ausführen, nicht
-- public.events lesen (die RLS-Policy für aktive Mitglieder bleibt unverändert). Neue Spalten an events werden
-- nie automatisch öffentlich; dafür müsste diese Funktion geändert werden. Achtung: Der Ort ist öffentlich.
--
-- Idempotent: mehrfach ausführbar.

create or replace function public.website_events()
returns table (
  id uuid,
  title text,
  event_date date,
  event_time time,
  end_time time,
  location text,
  organizer text,
  requires_registration boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.title,
    e.event_date,
    e.event_time,
    e.end_time,
    e.location,
    e.organizer,
    coalesce(e.requires_registration, false)
  from public.events e
  where e.event_date >= current_date - 730
  order by e.event_date, e.event_time nulls first;
$$;

comment on function public.website_events() is
  'Öffentliche Termine für investmentclubregensburg.com: nur Titel, Datum, Zeiten, Ort, Veranstalter, Anmeldung ja/nein. '
  'Keine Beschreibung, kein Flyer (Entscheidung Verein 2026-10-13). Aufgerufen vom Website-Container mit dem öffentlichen Schlüssel.';

revoke all on function public.website_events() from public;
grant execute on function public.website_events() to anon, authenticated, service_role;
