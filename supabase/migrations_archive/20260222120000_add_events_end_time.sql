-- events.end_time: optionale Endzeit (HH:MM) für Kalender/„Meine Events“.
-- Idempotent (IF NOT EXISTS) – sicher mehrfach ausführbar (schema-design / Deploys).

alter table public.events
  add column if not exists end_time text;

comment on column public.events.end_time is 'Endzeit des Events (HH:MM), optional';
