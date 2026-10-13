-- Aufgaben-Board für Vorstand und Admins (Verwaltung → Aufgaben)
--
-- Aufbau:
--   1) public.board_tasks – Aufgaben mit Status (geplant / in Arbeit / erledigt), Priorität,
--      optionaler Deadline und Zuständigen (Profil mit Rolle board oder admin). Erledigte
--      Aufgaben wandern ins Archiv (archived_at), damit die Spalte „Erledigt“ kurz bleibt.
--   2) Erinnerungen: pg_cron ruft täglich public.enqueue_task_deadline_reminders() auf. Die
--      Funktion legt für offene Aufgaben mit Deadline je Stufe ein Ereignis in der Outbox
--      public.notification_events an (Typ task_deadline); der bestehende Dispatch-Trigger
--      ruft die Edge Function notify-board auf, die an die zuständige Person mailt.
--        Stufe 1: Deadline in höchstens 2 Tagen
--        Stufe 2: Deadline heute oder überschritten
--      Ändert sich die Deadline, beginnen die Stufen neu.
--
-- Zugriff nur über Server Actions mit Service Role nach requireRole(["admin", "board"]);
-- RLS an, keine Policies für authenticated/anon.
--
-- Idempotent: mehrfach ausführbar.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 1) Aufgaben
-- ---------------------------------------------------------------------------
create table if not exists public.board_tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null check (char_length(btrim(title)) between 1 and 200),
  description         text not null default '' check (char_length(description) <= 4000),
  status              text not null default 'planned'
                      check (status in ('planned', 'in_progress', 'done')),
  priority            text not null default 'normal'
                      check (priority in ('low', 'normal', 'high')),
  deadline            date,
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,
  archived_at         timestamptz,
  -- Erinnerungen: für welche Deadline und bis zu welcher Stufe schon gemailt wurde.
  reminder_deadline   date,
  reminder_stage      smallint not null default 0 check (reminder_stage between 0 and 2)
);

comment on table public.board_tasks is
  'Aufgaben-Board für Vorstand/Admins (Verwaltung → Aufgaben). Deadline-Erinnerungen per pg_cron → notification_events (task_deadline). Nur Service Role.';

create index if not exists board_tasks_open_idx
  on public.board_tasks (status, deadline)
  where archived_at is null;
create index if not exists board_tasks_assignee_idx
  on public.board_tasks (assignee_profile_id);
create index if not exists board_tasks_created_by_idx
  on public.board_tasks (created_by);

alter table public.board_tasks enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Outbox: neuer Ereignistyp task_deadline
-- ---------------------------------------------------------------------------
alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check
  check (type in (
    'member_registered', 'member_cancelled', 'alumni_requested', 'alumni_decided',
    'event_announcement', 'task_deadline', 'test'
  ));

-- ---------------------------------------------------------------------------
-- 3) Erinnerungen einreihen (täglich per pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_task_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_count integer := 0;
  r record;
  v_stage smallint;
begin
  for r in
    select t.id, t.title, t.deadline, t.priority, t.status, t.assignee_profile_id,
           case when t.reminder_deadline is distinct from t.deadline then 0 else t.reminder_stage end as sent_stage
    from public.board_tasks t
    where t.archived_at is null
      and t.status <> 'done'
      and t.deadline is not null
      and t.assignee_profile_id is not null
      and t.deadline <= v_today + 2
    for update of t skip locked
  loop
    v_stage := case when r.deadline <= v_today then 2 else 1 end;
    continue when r.sent_stage >= v_stage;

    insert into public.notification_events (type, profile_id, payload)
    values (
      'task_deadline',
      r.assignee_profile_id,
      jsonb_build_object(
        'task_id', r.id,
        'title', r.title,
        'deadline', r.deadline,
        'priority', r.priority,
        'status', r.status,
        'stage', v_stage,
        'assignee_profile_id', r.assignee_profile_id
      )
    );

    update public.board_tasks
       set reminder_deadline = r.deadline,
           reminder_stage = v_stage
     where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_task_deadline_reminders() from public, anon, authenticated;

-- Täglich 07:00 UTC (08:00/09:00 in Regensburg). Vorhandenen Job gleichen Namens ersetzen.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'board-task-deadline-reminders') then
    perform cron.unschedule('board-task-deadline-reminders');
  end if;
  perform cron.schedule(
    'board-task-deadline-reminders',
    '0 7 * * *',
    'select public.enqueue_task_deadline_reminders();'
  );
end $$;
