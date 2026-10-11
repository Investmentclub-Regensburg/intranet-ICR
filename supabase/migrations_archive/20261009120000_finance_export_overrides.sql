-- Manuelle Anpassungen am Beitragseinzug (SEPA-Export) je Semester
--
-- Der Vorstand kann in der Vorschau des Finanzexports einzelne Mitglieder
--   * entfernen         (action = 'exclude'),
--   * auf Freisemester setzen (action = 'free_semester'),
--   * trotz automatischer Regel aufnehmen (action = 'include', z. B. Alumni, Gekündigt,
--     Eintritt nach dem Stichtag).
-- Die Anpassung gilt nur für das gewählte Semester und wird beim Export berücksichtigt
-- (app/(intranet)/admin/actions/finance.ts). Pro Semester und Profil höchstens eine.
--
-- Zugriff nur über Server Actions mit Service Role nach requireRole(EXPORT_ROLES);
-- RLS an, keine Policies für authenticated/anon.
--
-- Idempotent: mehrfach ausführbar.

create table if not exists public.finance_export_overrides (
  id          uuid primary key default gen_random_uuid(),
  semester    text not null check (semester in ('SoSe', 'WiSe')),
  year        integer not null check (year between 2000 and 2100),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  action      text not null check (action in ('include', 'exclude', 'free_semester')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  constraint finance_export_overrides_one_per_period unique (semester, year, profile_id)
);

comment on table public.finance_export_overrides is
  'Manuelle Anpassungen am SEPA-Beitragseinzug je Semester (aufnehmen, entfernen, Freisemester). Nur Service Role.';

create index if not exists finance_export_overrides_profile_id_idx
  on public.finance_export_overrides (profile_id);

alter table public.finance_export_overrides enable row level security;
