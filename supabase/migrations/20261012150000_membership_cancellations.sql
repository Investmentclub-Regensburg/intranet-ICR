-- Kündigung: Grund erfassen, Bestätigungsmail an das Mitglied
--
--  1) membership_cancellations: freiwilliger Kündigungsgrund (Auswahl + optionaler Freitext). Nur Service
--     Role; der Vorstand sieht die Einträge unter Verwaltung → Mitglieder.
--  2) Neuer Mail-Typ member_cancellation_confirmed (Bestätigung an das Mitglied).
--  3) cancel_membership(): Selbstkündigung in einem Schritt – Grund speichern, Status/Datum setzen,
--     Bestätigungsmail einreihen. Die Vorstandsmail (Trigger profiles_member_cancelled) enthält den Grund.
--     Datum und Beitragsstopp aus dem Berliner Datum, gleiche Regel wie der Finanzexport
--     (Kündigungsdatum < Semesterbeginn → kein Beitrag mehr für dieses Semester).
--  4) Aufbewahrung: Freitext in versendeten Vorstandsmails nach 30 Tagen, in membership_cancellations
--     nach 24 Monaten leeren (Grund bleibt für die Statistik).
--
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Kündigungsgründe
-- ---------------------------------------------------------------------------
create table if not exists public.membership_cancellations (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  cancelled_at timestamptz not null default now(),
  reason       text check (reason is null or reason in (
                 'studium_beendet', 'keine_zeit', 'zu_wenig_inhalte', 'inhalte_passen_nicht',
                 'beitrag', 'anderes_angebot', 'sonstiges'
               )),
  reason_text  text check (reason_text is null or char_length(reason_text) <= 500),
  created_at   timestamptz not null default now()
);

comment on table public.membership_cancellations is
  'Kündigungen mit freiwilligem Grund (Selbstkündigung im Intranet). Nur Service Role.';

create index if not exists membership_cancellations_cancelled_at_idx
  on public.membership_cancellations (cancelled_at desc);
create index if not exists membership_cancellations_profile_idx
  on public.membership_cancellations (profile_id);

alter table public.membership_cancellations enable row level security;
revoke all on public.membership_cancellations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Mail-Typ
-- ---------------------------------------------------------------------------
alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check
  check (type in (
    'member_registered', 'member_cancelled', 'member_cancellation_confirmed', 'alumni_requested',
    'alumni_decided', 'event_announcement', 'task_deadline', 'task_assigned', 'iban_changed', 'test'
  ));

-- Vorstandsmail mit Kündigungsgrund – nur aus derselben Transaktion (cancel_membership setzt
-- cancelled_at = now(); now() ist innerhalb einer Transaktion fest). Kündigung durch den Vorstand im
-- Admin-Bereich: self_service = false.
create or replace function public.enqueue_member_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       record;
  v_found boolean;
begin
  select mc.reason, mc.reason_text into c
    from public.membership_cancellations mc
   where mc.profile_id = new.id
     and mc.cancelled_at = now()
   order by mc.created_at desc
   limit 1;
  v_found := found;

  insert into public.notification_events (type, profile_id, payload)
  values (
    'member_cancelled',
    new.id,
    jsonb_build_object(
      'profile_id',      new.id,
      'user_id',         new.user_id,
      'vorname',         new."Vorname",
      'nachname',        new."Nachname",
      'email',           new."E-Mail",
      'mitgliedsnummer', new."Mitgliedsnummer",
      'studiengang',     new."Studiengang / Fach",
      'datum_antrag',    new."Datum_Antrag",
      'datum_kuendigung', new."Datum_Kündigung",
      'rolle',           new."Rolle",
      'status_vorher',   old."Status",
      'self_service',    v_found,
      'reason',          case when v_found then c.reason end,
      'reason_text',     case when v_found then c.reason_text end
    )
  );
  return new;
end;
$$;

revoke execute on function public.enqueue_member_cancelled() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Selbstkündigung (Server Action → RPC, nur Service Role)
-- ---------------------------------------------------------------------------
drop function if exists public.cancel_membership(uuid, text, text, text, text);

create or replace function public.cancel_membership(
  p_profile_id  uuid,
  p_reason      text,
  p_reason_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles%rowtype;
  v_now      timestamptz := now();
  v_today    date := (now() at time zone 'Europe/Berlin')::date;
  v_year     integer := extract(year from (now() at time zone 'Europe/Berlin'))::integer;
  v_semester text;
  v_stichtag date;
  v_pays     boolean;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'cancel_membership: Profil % nicht gefunden', p_profile_id;
  end if;
  if lower(trim(coalesce(v_profile."Status", ''))) = 'cancelled' then
    raise exception 'cancel_membership: bereits gekündigt';
  end if;
  -- Wie im Admin-Bereich: mindestens ein aktives Vorstandsmitglied muss bleiben. Sperre, damit sich
  -- die letzten beiden nicht gleichzeitig kündigen können.
  perform pg_advisory_xact_lock(hashtext('icr_board_guard'));
  if v_profile."Rolle"::text = 'board' and not exists (
    select 1 from public.profiles p
     where p.id <> p_profile_id
       and p."Rolle"::text = 'board'
       and lower(trim(coalesce(p."Status", ''))) <> 'cancelled'
  ) then
    raise exception 'cancel_membership: letztes Vorstandsmitglied';
  end if;

  -- Beitragsstopp: erstes Semester, dessen Beginn nach dem heutigen Berliner Datum liegt.
  -- Alumni zahlen keinen Beitrag.
  v_pays := coalesce(v_profile."Rolle"::text, '') <> 'alumni' and lower(trim(coalesce(v_profile."Status", ''))) <> 'alumni';
  if v_today < make_date(v_year, 3, 15) then
    v_semester := 'Sommersemester ' || v_year;
    v_stichtag := make_date(v_year, 3, 15);
  elsif v_today < make_date(v_year, 10, 1) then
    v_semester := 'Wintersemester ' || v_year || '/' || lpad(((v_year + 1) % 100)::text, 2, '0');
    v_stichtag := make_date(v_year, 10, 1);
  else
    v_semester := 'Sommersemester ' || (v_year + 1);
    v_stichtag := make_date(v_year + 1, 3, 15);
  end if;

  insert into public.membership_cancellations (profile_id, cancelled_at, reason, reason_text)
  values (p_profile_id, v_now, nullif(trim(p_reason), ''), nullif(trim(left(p_reason_text, 500)), ''));

  -- Löst die Vorstandsmail (mit Grund) und die Sperre des Kontos aus.
  update public.profiles
     set "Status" = 'cancelled',
         "Datum_Kündigung" = v_today
   where id = p_profile_id;

  if v_profile.user_id is not null then
    insert into public.notification_events (type, profile_id, payload)
    values (
      'member_cancellation_confirmed',
      p_profile_id,
      jsonb_build_object(
        'profile_id',       p_profile_id,
        'user_id',          v_profile.user_id,
        'datum_kuendigung', v_today,
        'reason_given',     nullif(trim(p_reason), '') is not null or nullif(trim(p_reason_text), '') is not null,
        'fee_semester',     case when v_pays then v_semester end,
        'fee_stichtag',     case when v_pays then to_char(v_stichtag, 'DD.MM.YYYY') end
      )
    );
  end if;
end;
$$;

revoke execute on function public.cancel_membership(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_membership(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Aufbewahrung
-- ---------------------------------------------------------------------------
select cron.schedule(
  'cancellation-text-cleanup',
  '45 3 * * *',
  $cron$
    update public.notification_events
       set payload = payload - 'reason_text'
     where type = 'member_cancelled'
       and sent_at is not null
       and sent_at < now() - interval '30 days'
       and payload ? 'reason_text';
    update public.membership_cancellations
       set reason_text = null
     where reason_text is not null
       and cancelled_at < now() - interval '24 months';
  $cron$
);
