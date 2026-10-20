-- public.website_events() liefert zusätzlich end_date (mehrtägige Events, siehe 20261020100000_events_end_date).
--
-- Ohne end_date wäre end_time für die Website mehrdeutig: Bei mehrtägigen Events gilt event_time für den
-- ersten und end_time für den letzten Tag. end_date NULL = eintägig wie bisher (dann gilt die bisherige
-- Regel: end_time vor event_time heißt Folgetag).
--
-- Für die Website ist das ein zusätzliches Feld im JSON; alle bisherigen Felder bleiben gleich. end_date
-- ist bewusst die letzte Spalte. Sonst unverändert: feste Spaltenliste, keine Beschreibung, kein Flyer,
-- dieselben Rechte (anon darf nur diese Funktion ausführen).
--
-- Der Rückgabetyp ändert sich, daher drop + create (create or replace kann das nicht). Die Migration läuft
-- in einer Transaktion, die Funktion fehlt also zu keinem Zeitpunkt.
--
-- Idempotent: mehrfach ausführbar.

drop function if exists public.website_events();

create function public.website_events()
returns table (
  id uuid,
  title text,
  event_date date,
  event_time time,
  end_time time,
  location text,
  organizer text,
  requires_registration boolean,
  end_date date
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
    coalesce(e.requires_registration, false),
    e.end_date
  from public.events e
  where e.event_date >= current_date - 730
  order by e.event_date, e.event_time nulls first;
$$;

comment on function public.website_events() is
  'Öffentliche Termine für investmentclubregensburg.com: nur Titel, Datum, Zeiten, Ort, Veranstalter, Anmeldung ja/nein, '
  'bei mehrtägigen Events das Enddatum (end_date; event_time gilt dann für den ersten, end_time für den letzten Tag). '
  'Keine Beschreibung, kein Flyer (Entscheidung Verein 2026-10-13). Aufgerufen vom Website-Container mit dem öffentlichen Schlüssel.';

revoke all on function public.website_events() from public;
grant execute on function public.website_events() to anon, authenticated, service_role;
