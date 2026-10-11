-- Aufgaben-Board: mehrere Zuständige je Aufgabe
--
--  * public.board_task_assignees: Zuordnung Aufgabe ↔ Profil (Vorstand/Admin), beliebig viele je Aufgabe.
--  * Bestehende Zuständige aus board_tasks.assignee_profile_id werden übernommen. Die Spalte bleibt
--    vorerst bestehen (ältere App-Versionen lesen sie) und zeigt auf die erste zuständige Person.
--  * enqueue_task_deadline_reminders(): eine Erinnerung je zuständiger Person.
--
-- Zugriff nur über Server Actions mit Service Role; RLS an, keine Policies.
-- Idempotent: mehrfach ausführbar.

create table if not exists public.board_task_assignees (
  task_id    uuid not null references public.board_tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

comment on table public.board_task_assignees is
  'Zuständige je Aufgabe im Aufgaben-Board (Vorstand/Admins). Nur Service Role.';

create index if not exists board_task_assignees_profile_idx on public.board_task_assignees (profile_id);

alter table public.board_task_assignees enable row level security;

insert into public.board_task_assignees (task_id, profile_id)
select t.id, t.assignee_profile_id
  from public.board_tasks t
 where t.assignee_profile_id is not null
on conflict do nothing;

comment on column public.board_tasks.assignee_profile_id is
  'Veraltet: erste zuständige Person. Maßgeblich ist public.board_task_assignees.';

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
  a record;
  v_stage smallint;
begin
  for r in
    select t.id, t.title, t.deadline, t.priority, t.status,
           case when t.reminder_deadline is distinct from t.deadline then 0 else t.reminder_stage end as sent_stage
    from public.board_tasks t
    where t.archived_at is null
      and t.status <> 'done'
      and t.deadline is not null
      and t.deadline <= v_today + 2
      and exists (select 1 from public.board_task_assignees x where x.task_id = t.id)
    for update of t skip locked
  loop
    v_stage := case when r.deadline <= v_today then 2 else 1 end;
    continue when r.sent_stage >= v_stage;

    for a in
      select x.profile_id from public.board_task_assignees x where x.task_id = r.id
    loop
      insert into public.notification_events (type, profile_id, payload)
      values (
        'task_deadline',
        a.profile_id,
        jsonb_build_object(
          'task_id', r.id,
          'title', r.title,
          'deadline', r.deadline,
          'priority', r.priority,
          'status', r.status,
          'stage', v_stage,
          'assignee_profile_id', a.profile_id
        )
      );
      v_count := v_count + 1;
    end loop;

    update public.board_tasks
       set reminder_deadline = r.deadline,
           reminder_stage = v_stage
     where id = r.id;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_task_deadline_reminders() from public, anon, authenticated;
