-- Mitglied per Mail informieren, wenn sein Alumni-Antrag freigeschaltet oder abgelehnt wurde.
-- Neuer Event-Typ 'alumni_decided' in der Outbox; Empfänger steht in payload.recipient.
-- Greift auf allen Wegen: Admin-Seite, Rollen-Dropdown (Trigger schließt den Antrag) und manuelle Edits.

alter table public.notification_events
  drop constraint if exists notification_events_type_check;
alter table public.notification_events
  add constraint notification_events_type_check
  check (type in ('member_registered', 'member_cancelled', 'alumni_requested', 'alumni_decided', 'test'));

create or replace function public.enqueue_alumni_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_events (type, profile_id, payload)
  values (
    'alumni_decided',
    new.profile_id,
    jsonb_build_object(
      'request_id', new.id,
      'profile_id', new.profile_id,
      'user_id',    new.user_id,
      'vorname',    new.vorname,
      'nachname',   new.nachname,
      'email',      new.email,
      'recipient',  new.email,
      'decision',   new.status,
      'handled_at', new.handled_at
    )
  );
  return new;
end;
$$;

revoke execute on function public.enqueue_alumni_decided() from public, anon, authenticated;

drop trigger if exists alumni_requests_decided on public.alumni_requests;
create trigger alumni_requests_decided
  after update of status on public.alumni_requests
  for each row
  when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function public.enqueue_alumni_decided();
