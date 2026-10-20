-- Mehrtägige Events (z. B. Ausflüge): optionales Enddatum an public.events.
--
-- end_date NULL = eintägig wie bisher; bestehende Zeilen bleiben unverändert (keine Datenänderung).
-- Ist end_date gesetzt, liegt es nach event_date (gleicher Tag wird von der App als NULL gespeichert)
-- und höchstens 31 Tage danach. event_time gilt dann für den ersten Tag, end_time für den letzten;
-- die Folgetag-Regel für end_time < event_time gilt nur für eintägige Events.
--
-- public.website_events() bleibt bewusst unverändert (Entscheidung 2026-10-20): Die Website zeigt
-- vorerst nur den ersten Tag. Die Anmelde-Policy (bis einschließlich event_date) bleibt ebenfalls.
--
-- Idempotent: mehrfach ausführbar.

alter table public.events add column if not exists end_date date;

alter table public.events drop constraint if exists events_end_date_range;
alter table public.events add constraint events_end_date_range
  check (end_date is null or (end_date > event_date and end_date <= event_date + 31));

comment on column public.events.end_date is
  'Letzter Tag bei mehrtägigen Events (optional, nach event_date, max. 31 Tage). event_time gilt für den ersten, end_time für den letzten Tag.';

comment on column public.events.end_time is
  'Endzeit (optional). Eintägig: liegt sie vor event_time, endet das Event am Folgetag. Mehrtägig: Uhrzeit am end_date.';
