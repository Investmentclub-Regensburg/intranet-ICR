-- Basis-Migration: Schema der Produktion (Intranet-Database) vom 11.10.2026
--
-- Erzeugt per `supabase db dump` (nur Struktur, keine Daten) und ergänzt um das, was der Dump
-- nicht enthält: Trigger auf auth.users, Storage-Buckets und -Regeln, Cron-Jobs.
-- Nicht enthalten (je Umgebung eigens): Vault-Secrets notify_board_url/notify_board_secret.
-- Ohne sie bleiben Benachrichtigungen in public.notification_events liegen (keine Mails).
-- Nicht enthalten: private.registration_meta_backup (temporäre Sicherung, nur in Produktion).
--
-- Ältere Migrationen: supabase/migrations_archive/ (in Produktion bereits eingespielt).
-- In Produktion ist diese Datei per `supabase migration repair` als eingespielt markiert.
-- Diese Datei NIE nachträglich ändern (CI prüft die Prüfsumme). Änderungen nur als neue Migration.

-- Schutz: Läuft nur auf einer leeren Datenbank (CI, Test-Projekt), nie erneut in der Produktion.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'Baseline: Schema existiert bereits – nicht erneut ausführen';
  END IF;
END $$;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";










COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."member_status" AS ENUM (
    'active',
    'alumni',
    'applicant',
    'paused',
    'cancelled'
);


ALTER TYPE "public"."member_status" OWNER TO "postgres";


CREATE TYPE "public"."salutation_type" AS ENUM (
    'Herr',
    'Frau',
    'Divers'
);


ALTER TYPE "public"."salutation_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'member',
    'admin',
    'board',
    'alumni'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alumni_request_fill_from_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  p record;
begin
  select pr.id, pr."Vorname" as vorname, pr."Nachname" as nachname, pr."E-Mail" as email
    into p
    from public.profiles pr
   where pr.user_id = new.user_id
   limit 1;

  if p.id is null then
    raise exception 'Kein Profil zum Konto gefunden';
  end if;

  new.profile_id := p.id;
  new.vorname    := coalesce(p.vorname, '');
  new.nachname   := coalesce(p.nachname, '');
  new.email      := p.email;
  new.status     := 'pending';
  new.handled_at := null;
  new.handled_by := null;
  return new;
end;
$$;


ALTER FUNCTION "public"."alumni_request_fill_from_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bvh_request_fill_from_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  p record;
begin
  select pr.id, pr."Vorname" as vorname, pr."Nachname" as nachname, pr."E-Mail" as email
    into p
    from public.profiles pr
   where pr.user_id = new.user_id
   limit 1;

  if p.id is null then
    raise exception 'Kein Profil zum Konto gefunden';
  end if;

  new.vorname  := coalesce(p.vorname, '');
  new.nachname := coalesce(p.nachname, '');
  new.email    := p.email;
  new.handled  := false;
  return new;
end;
$$;


ALTER FUNCTION "public"."bvh_request_fill_from_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_alumni_requests_on_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.alumni_requests
  set status = 'approved',
      handled_at = coalesce(handled_at, now())
  where profile_id = new.id
    and status = 'pending';
  return new;
end;
$$;


ALTER FUNCTION "public"."close_alumni_requests_on_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_notification_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  fn_url    text;
  fn_secret text;
begin
  select s.decrypted_secret into fn_url
  from vault.decrypted_secrets s
  where s.name = 'notify_board_url'
  limit 1;

  select s.decrypted_secret into fn_secret
  from vault.decrypted_secrets s
  where s.name = 'notify_board_secret'
  limit 1;

  if fn_url is null or fn_secret is null then
    raise warning 'notify_board: Vault-Secrets fehlen – Event % bleibt in der Outbox', new.id;
    return new;
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('event_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', fn_secret
    ),
    timeout_milliseconds := 8000
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."dispatch_notification_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_alumni_decided"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email   text;
  v_vorname text;
begin
  select pr."E-Mail", pr."Vorname"
    into v_email, v_vorname
    from public.profiles pr
   where pr.user_id = new.user_id
   limit 1;

  insert into public.notification_events (type, profile_id, payload)
  values (
    'alumni_decided',
    new.profile_id,
    jsonb_build_object(
      'request_id', new.id,
      'profile_id', new.profile_id,
      'user_id',    new.user_id,
      'vorname',    coalesce(v_vorname, ''),
      'nachname',   new.nachname,
      'email',      v_email,
      'recipient',  v_email,
      'decision',   new.status,
      'handled_at', new.handled_at
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."enqueue_alumni_decided"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_alumni_requested"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  p record;
begin
  select
    pr."Studiengang / Fach" as studiengang,
    pr."Datum_Antrag"       as datum_antrag,
    pr."Rolle"              as rolle
  into p
  from public.profiles pr
  where pr.id = new.profile_id;

  insert into public.notification_events (type, profile_id, payload)
  values (
    'alumni_requested',
    new.profile_id,
    jsonb_build_object(
      'request_id',   new.id,
      'profile_id',   new.profile_id,
      'user_id',      new.user_id,
      'vorname',      new.vorname,
      'nachname',     new.nachname,
      'email',        new.email,
      'studiengang',  p.studiengang,
      'datum_antrag', p.datum_antrag,
      'rolle',        p.rolle
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."enqueue_alumni_requested"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_event_announcement"("p_event_id" "uuid", "p_payload" "jsonb", "p_cooldown_seconds" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
begin
  if p_payload->>'event_id' is distinct from p_event_id::text then
    raise exception 'payload.event_id passt nicht zum Event';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event_announcement:' || p_event_id::text, 0));

  if p_payload->>'mode' = 'all' and exists (
    select 1
      from public.notification_events n
     where n.type = 'event_announcement'
       and n.payload->>'event_id' = p_event_id::text
       and n.payload->>'mode' = 'all'
       and n.created_at >= now() - make_interval(secs => greatest(p_cooldown_seconds, 0))
  ) then
    return null;
  end if;

  insert into public.notification_events (type, payload)
  values ('event_announcement', p_payload)
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."enqueue_event_announcement"("p_event_id" "uuid", "p_payload" "jsonb", "p_cooldown_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_member_cancelled"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
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
      'status_vorher',   old."Status"
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."enqueue_member_cancelled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_member_registered"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.notification_events (type, profile_id, payload)
  values (
    'member_registered',
    new.id,
    jsonb_build_object(
      'profile_id',   new.id,
      'user_id',      new.user_id,
      'vorname',      new."Vorname",
      'nachname',     new."Nachname",
      'email',        new."E-Mail",
      'studiengang',  new."Studiengang / Fach",
      'abschluss',    new."Abschluss",
      'semester',     new."Semester",
      'hochschulart', new."Hochschulart",
      'ort',          new."Ort",
      'datum_antrag', new."Datum_Antrag",
      'status',       new."Status",
      'rolle',        new."Rolle"
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."enqueue_member_registered"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_task_deadline_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."enqueue_task_deadline_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_pending_registration"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  delete from public.pending_registrations r
   using public.profiles p
   where r.user_id = p_user_id
     and p.user_id = p_user_id
     and public.registration_meta_is_redundant(r.data, p.id);
$$;


ALTER FUNCTION "public"."finish_pending_registration"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.email_confirmed_at is not null then
    perform public.provision_profile_for_auth_user(new.id, false);
    perform public.finish_pending_registration(new.id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_pending_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  d jsonb := new.data;
begin
  if exists (select 1 from auth.users u where u.id = new.user_id and u.email_confirmed_at is not null) then
    perform public.provision_profile_for_auth_user(new.user_id, false);

    update public.profiles p
       set "Geburtsdatum"       = coalesce(p."Geburtsdatum",
                                    public.registration_date(d->>'Geburtsdatum')),
           "Straße"             = coalesce(nullif(p."Straße", ''), left(d->>'Straße', 100)),
           "Hausnummer"         = coalesce(nullif(p."Hausnummer", ''), left(d->>'Hausnr', 20)),
           "Ort"                = coalesce(nullif(p."Ort", ''), left(d->>'Ort', 100)),
           "PLZ"                = coalesce(nullif(p."PLZ", ''), left(d->>'PLZ', 10)),
           "Handynummer"        = coalesce(nullif(p."Handynummer", ''), left(d->>'Handynummer', 40)),
           "Studiengang / Fach" = coalesce(nullif(p."Studiengang / Fach", ''), left(d->>'Fach', 150)),
           "Abschluss"          = coalesce(nullif(p."Abschluss", ''), left(d->>'Abschluss', 150)),
           "Semester"           = coalesce(p."Semester",
                                    case when (d->>'Semester') ~ '^\d{1,2}$' then (d->>'Semester')::integer end),
           "Hochschulart"       = coalesce(nullif(p."Hochschulart", ''), left(d->>'Uni/OTH', 150)),
           "IBAN"               = coalesce(nullif(p."IBAN", ''), left(d->>'IBAN', 34)),
           "BIC"                = coalesce(nullif(p."BIC", ''), left(d->>'BIC', 11)),
           "Sepa-Bestätigung"   = coalesce(p."Sepa-Bestätigung", false)
                                  or lower(coalesce(d->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on')
     where p.user_id = new.user_id
       and p.id = new.user_id
       and p."Datum_Antrag" = current_date;

    perform public.finish_pending_registration(new.user_id);
  end if;
  return null;
end;
$_$;


ALTER FUNCTION "public"."handle_pending_registration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_email_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.provision_profile_for_auth_user(new.id, true);
    perform public.finish_pending_registration(new.id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_email_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
      from public.profiles p
     where p.user_id = auth.uid()
       and lower(trim(coalesce(p."Status", ''))) not in ('cancelled', 'applicant')
  );
$$;


ALTER FUNCTION "public"."is_active_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_or_board"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p."Rolle" in ('admin', 'board')
      and lower(trim(coalesce(p."Status", ''))) <> 'cancelled'
  );
$$;


ALTER FUNCTION "public"."is_admin_or_board"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_track_iban_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_old text := upper(regexp_replace(coalesce(old."IBAN", ''), '\s', '', 'g'));
  v_new text := upper(regexp_replace(coalesce(new."IBAN", ''), '\s', '', 'g'));
begin
  -- Erstmals hinterlegte IBAN ist keine Mandatsänderung.
  if v_old <> '' and v_old is distinct from v_new then
    new.iban_changed_at := now();
    insert into public.notification_events (type, profile_id, payload)
    values (
      'iban_changed',
      new.id,
      jsonb_build_object(
        'profile_id',     new.id,
        'vorname',        new."Vorname",
        'nachname',       new."Nachname",
        'email',          new."E-Mail",
        'iban_last4',     right(v_new, 4),
        'old_iban_last4', right(v_old, 4),
        'changed_at',     now()
      )
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_track_iban_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provision_profile_for_auth_user"("p_user_id" "uuid", "p_link_existing" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  u               auth.users%rowtype;
  meta            jsonb;
  birth_date      date;
  semester_number integer;
  sepa_confirmed  boolean;
begin
  select * into u from auth.users where id = p_user_id;
  if not found or u.email is null then
    return;
  end if;

  -- Konto ist bereits mit einem Profil verknüpft.
  if exists (select 1 from public.profiles p where p.user_id = u.id) then
    return;
  end if;

  -- Es gibt schon ein Profil mit dieser E-Mail-Adresse.
  if exists (select 1 from public.profiles p where lower(p."E-Mail") = lower(u.email)) then
    if p_link_existing then
      update public.profiles
         set user_id = u.id
       where id = (
         select p2.id
           from public.profiles p2
          where lower(p2."E-Mail") = lower(u.email)
            and p2.user_id is null
          order by p2.created_at nulls last, p2.id
          limit 1
       );
    end if;
    -- Kein zweites Profil mit derselben E-Mail-Adresse anlegen.
    return;
  end if;

  -- Neues Profil aus den Registrierungsdaten.
  meta := coalesce(u.raw_user_meta_data, '{}'::jsonb)
       || coalesce((select r.data from public.pending_registrations r where r.user_id = u.id), '{}'::jsonb);

  birth_date := public.registration_date(meta->>'Geburtsdatum');

  if (meta->>'Semester') ~ '^\d{1,2}$' then
    semester_number := (meta->>'Semester')::integer;
  end if;

  sepa_confirmed := lower(coalesce(meta->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');

  insert into public.profiles (
    "id", "user_id", "E-Mail", "Status", "Rolle", "Datum_Antrag",
    "Vorname", "Nachname", "Geburtsdatum", "Straße", "Hausnummer", "Ort", "PLZ",
    "Handynummer", "Studiengang / Fach", "Abschluss", "Semester", "Hochschulart",
    "IBAN", "BIC", "Sepa-Bestätigung"
  )
  values (
    u.id, u.id, u.email, 'active', 'member', current_date,
    left(meta->>'Vorname', 100),
    left(meta->>'Nachname', 100),
    birth_date,
    left(meta->>'Straße', 100),
    left(meta->>'Hausnr', 20),
    left(meta->>'Ort', 100),
    left(meta->>'PLZ', 10),
    left(meta->>'Handynummer', 40),
    left(meta->>'Fach', 150),
    left(meta->>'Abschluss', 150),
    semester_number,
    left(meta->>'Uni/OTH', 150),
    left(meta->>'IBAN', 34),
    left(meta->>'BIC', 11),
    sepa_confirmed
  );
end;
$_$;


ALTER FUNCTION "public"."provision_profile_for_auth_user"("p_user_id" "uuid", "p_link_existing" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rate_limit_hit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_hits integer;
begin
  if p_key is null or char_length(p_key) > 200 or p_max < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.auth_rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set window_start = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else r.window_start
        end,
        hits = case
          when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else r.hits + 1
        end
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;


ALTER FUNCTION "public"."rate_limit_hit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registration_compact"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s/().-]', '', 'g')), '');
$$;


ALTER FUNCTION "public"."registration_compact"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registration_date"("p" "text") RETURNS "date"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $_$
begin
  if p ~ '^\d{4}-\d{2}-\d{2}$' then
    return p::date;
  end if;
  return null;
exception
  when others then
    return null;
end;
$_$;


ALTER FUNCTION "public"."registration_date"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registration_meta_is_redundant"("p_meta" "jsonb", "p_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce((
    select
          (public.registration_compact(p_meta->>'IBAN') is null
            or public.registration_compact(p_meta->>'IBAN') = public.registration_compact(p."IBAN"))
      and (public.registration_compact(p_meta->>'BIC') is null
            or public.registration_compact(p_meta->>'BIC') = public.registration_compact(p."BIC"))
      and (public.registration_compact(p_meta->>'Handynummer') is null
            or public.registration_compact(p_meta->>'Handynummer') = public.registration_compact(p."Handynummer"))
      and (public.registration_compact(p_meta->>'PLZ') is null
            or public.registration_compact(p_meta->>'PLZ') = public.registration_compact(p."PLZ"))
      and (public.registration_norm(p_meta->>'Geburtsdatum') is null
            or public.registration_norm(p_meta->>'Geburtsdatum') = to_char(p."Geburtsdatum", 'YYYY-MM-DD'))
      and (public.registration_norm(p_meta->>'Semester') is null
            or public.registration_norm(p_meta->>'Semester') = p."Semester"::text)
      and (public.registration_norm(p_meta->>'Straße') is null
            or public.registration_norm(p_meta->>'Straße') = public.registration_norm(p."Straße"))
      and (public.registration_norm(p_meta->>'Hausnr') is null
            or public.registration_norm(p_meta->>'Hausnr') = public.registration_norm(p."Hausnummer"))
      and (public.registration_norm(p_meta->>'Ort') is null
            or public.registration_norm(p_meta->>'Ort') = public.registration_norm(p."Ort"))
      and (public.registration_norm(p_meta->>'Fach') is null
            or public.registration_norm(p_meta->>'Fach') = public.registration_norm(p."Studiengang / Fach"))
      and (public.registration_norm(p_meta->>'Abschluss') is null
            or public.registration_norm(p_meta->>'Abschluss') = public.registration_norm(p."Abschluss"))
      and (public.registration_norm(p_meta->>'Uni/OTH') is null
            or public.registration_norm(p_meta->>'Uni/OTH') = public.registration_norm(p."Hochschulart"))
      and (coalesce(public.registration_norm(p_meta->>'Sepa-Bestätigung'), 'false') not in ('true', 't', '1', 'yes', 'on')
            or p."Sepa-Bestätigung" is true)
      from public.profiles p
     where p.id = p_profile_id
  ), false);
$$;


ALTER FUNCTION "public"."registration_meta_is_redundant"("p_meta" "jsonb", "p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registration_meta_keys"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select array[
    'IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'Ort', 'PLZ', 'Handynummer',
    'Fach', 'Abschluss', 'Semester', 'Uni/OTH', 'Sepa-Bestätigung'
  ];
$$;


ALTER FUNCTION "public"."registration_meta_keys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registration_norm"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '');
$$;


ALTER FUNCTION "public"."registration_norm"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."strip_registration_meta"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_profile_id uuid;
begin
  if jsonb_typeof(new.raw_user_meta_data) = 'object'
     and new.raw_user_meta_data ?| public.registration_meta_keys() then
    select p.id into v_profile_id from public.profiles p where p.user_id = new.id;
    if v_profile_id is not null
       and public.registration_meta_is_redundant(new.raw_user_meta_data, v_profile_id) then
      new.raw_user_meta_data := new.raw_user_meta_data - public.registration_meta_keys();
    end if;
  end if;
  return new;
exception
  -- Ein Login darf nie an dieser Bereinigung scheitern.
  when others then
    raise warning 'strip_registration_meta: %', sqlstate;
    return new;
end;
$$;


ALTER FUNCTION "public"."strip_registration_meta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_auth_ban_from_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.user_id is null then
    return new;
  end if;

  if lower(trim(coalesce(new."Status", ''))) = 'cancelled' then
    update auth.users
       set banned_until = '2999-12-31 00:00:00+00'
     where id = new.user_id
       and (banned_until is null or banned_until < '2999-12-31 00:00:00+00');
  else
    update auth.users
       set banned_until = null
     where id = new.user_id
       and banned_until = '2999-12-31 00:00:00+00';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_auth_ban_from_profile"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";









CREATE TABLE IF NOT EXISTS "public"."alumni_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "vorname" "text" DEFAULT ''::"text" NOT NULL,
    "nachname" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "handled_at" timestamp with time zone,
    "handled_by" "uuid",
    CONSTRAINT "alumni_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."alumni_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."alumni_requests" IS 'Anträge von Mitgliedern auf den Alumni-Status. Freigabe durch den Vorstand setzt profiles.Rolle = alumni.';



CREATE TABLE IF NOT EXISTS "public"."auth_rate_limits" (
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hits" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "auth_rate_limits_key_check" CHECK (("char_length"("key") <= 200))
);


ALTER TABLE "public"."auth_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."board_task_assignees" (
    "task_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."board_task_assignees" OWNER TO "postgres";


COMMENT ON TABLE "public"."board_task_assignees" IS 'Zuständige je Aufgabe im Aufgaben-Board (Vorstand/Admins). Nur Service Role.';



CREATE TABLE IF NOT EXISTS "public"."board_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "deadline" "date",
    "assignee_profile_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "reminder_deadline" "date",
    "reminder_stage" smallint DEFAULT 0 NOT NULL,
    CONSTRAINT "board_tasks_description_check" CHECK (("char_length"("description") <= 4000)),
    CONSTRAINT "board_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"]))),
    CONSTRAINT "board_tasks_reminder_stage_check" CHECK ((("reminder_stage" >= 0) AND ("reminder_stage" <= 2))),
    CONSTRAINT "board_tasks_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'done'::"text"]))),
    CONSTRAINT "board_tasks_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 200)))
);


ALTER TABLE "public"."board_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."board_tasks" IS 'Aufgaben-Board für Vorstand/Admins (Verwaltung → Aufgaben). Deadline-Erinnerungen per pg_cron → notification_events (task_deadline). Nur Service Role.';



COMMENT ON COLUMN "public"."board_tasks"."assignee_profile_id" IS 'Veraltet: erste zuständige Person. Maßgeblich ist public.board_task_assignees.';



CREATE TABLE IF NOT EXISTS "public"."bvh_login_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vorname" "text" DEFAULT ''::"text" NOT NULL,
    "nachname" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" NOT NULL,
    "handled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bvh_login_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."event_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "event_date" "date" NOT NULL,
    "event_time" time without time zone,
    "location" "text",
    "organizer" "text",
    "image_url" "text",
    "requires_registration" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "end_time" time without time zone,
    CONSTRAINT "events_end_requires_start" CHECK ((("end_time" IS NULL) OR ("event_time" IS NOT NULL))),
    CONSTRAINT "events_title_not_blank" CHECK (("length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."end_time" IS 'Endzeit (optional). Liegt sie vor event_time, endet das Event am Folgetag.';



CREATE TABLE IF NOT EXISTS "public"."finance_export_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester" "text" NOT NULL,
    "year" integer NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "finance_export_overrides_action_check" CHECK (("action" = ANY (ARRAY['include'::"text", 'exclude'::"text", 'free_semester'::"text"]))),
    CONSTRAINT "finance_export_overrides_semester_check" CHECK (("semester" = ANY (ARRAY['SoSe'::"text", 'WiSe'::"text"]))),
    CONSTRAINT "finance_export_overrides_year_check" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);


ALTER TABLE "public"."finance_export_overrides" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_export_overrides" IS 'Manuelle Anpassungen am SEPA-Beitragseinzug je Semester (aufnehmen, entfernen, Freisemester). Nur Service Role.';



CREATE TABLE IF NOT EXISTS "public"."finance_exports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semester" "text" NOT NULL,
    "year" integer NOT NULL,
    "format" "text" NOT NULL,
    "collection_date" "date",
    "tx_count" integer NOT NULL,
    "total_amount" numeric(12,2) NOT NULL,
    "amended_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_exports_amended_count_check" CHECK (("amended_count" >= 0)),
    CONSTRAINT "finance_exports_format_check" CHECK (("format" = ANY (ARRAY['csv'::"text", 'xml'::"text"]))),
    CONSTRAINT "finance_exports_semester_check" CHECK (("semester" = ANY (ARRAY['SoSe'::"text", 'WiSe'::"text"]))),
    CONSTRAINT "finance_exports_total_amount_check" CHECK (("total_amount" >= (0)::numeric)),
    CONSTRAINT "finance_exports_tx_count_check" CHECK (("tx_count" >= 0)),
    CONSTRAINT "finance_exports_year_check" CHECK ((("year" >= 2000) AND ("year" <= 2100)))
);


ALTER TABLE "public"."finance_exports" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_exports" IS 'Protokoll der Finanzexporte (CSV/SEPA-XML). Letzter XML-Export = Bezug für Mandatsänderungen. Nur Service Role.';



CREATE TABLE IF NOT EXISTS "public"."news" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "author_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."news" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "profile_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    CONSTRAINT "notification_events_type_check" CHECK (("type" = ANY (ARRAY['member_registered'::"text", 'member_cancelled'::"text", 'alumni_requested'::"text", 'alumni_decided'::"text", 'event_announcement'::"text", 'task_deadline'::"text", 'task_assigned'::"text", 'iban_changed'::"text", 'test'::"text"])))
);


ALTER TABLE "public"."notification_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_events" IS 'Outbox für Vorstands-Benachrichtigungen. Wird von Triggern befüllt und von der Edge Function notify-board abgearbeitet.';



CREATE TABLE IF NOT EXISTS "public"."pending_registrations" (
    "user_id" "uuid" NOT NULL,
    "data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_registrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."pending_registrations" IS 'Registrierungsdaten bis zur E-Mail-Bestätigung (danach im Profil). Nur Service Role.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid",
    "Mitgliedsnummer" "text",
    "Status" "text",
    "Datum_Antrag" "date",
    "Datum_Kündigung" "date",
    "Anrede" "text",
    "Vorname" "text",
    "Nachname" "text",
    "Geburtsdatum" "date",
    "Straße" "text",
    "Hausnummer" "text",
    "Ort" "text",
    "PLZ" "text",
    "E-Mail" "text" NOT NULL,
    "Handynummer" "text",
    "Studiengang / Fach" "text",
    "Abschluss" "text",
    "Semester" integer,
    "Hochschulart" "text",
    "IBAN" "text",
    "BIC" "text",
    "Datum_Mandat" "date",
    "Sepa-Bestätigung" boolean DEFAULT false,
    "Vereinsatzung-Bestätigung" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "Rolle" "public"."user_role" DEFAULT 'member'::"public"."user_role",
    "letzter_news_aufruf" timestamp with time zone DEFAULT '2000-01-01 00:00:00+00'::timestamp with time zone,
    "iban_changed_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";





ALTER TABLE ONLY "public"."alumni_requests"
    ADD CONSTRAINT "alumni_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_rate_limits"
    ADD CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."board_task_assignees"
    ADD CONSTRAINT "board_task_assignees_pkey" PRIMARY KEY ("task_id", "profile_id");



ALTER TABLE ONLY "public"."board_tasks"
    ADD CONSTRAINT "board_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bvh_login_requests"
    ADD CONSTRAINT "bvh_login_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_export_overrides"
    ADD CONSTRAINT "finance_export_overrides_one_per_period" UNIQUE ("semester", "year", "profile_id");



ALTER TABLE ONLY "public"."finance_export_overrides"
    ADD CONSTRAINT "finance_export_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_exports"
    ADD CONSTRAINT "finance_exports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_registrations"
    ADD CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_Email_key" UNIQUE ("E-Mail");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "alumni_requests_created_at_idx" ON "public"."alumni_requests" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "alumni_requests_one_pending_per_user" ON "public"."alumni_requests" USING "btree" ("user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "alumni_requests_profile_id_idx" ON "public"."alumni_requests" USING "btree" ("profile_id");



CREATE INDEX "board_task_assignees_profile_idx" ON "public"."board_task_assignees" USING "btree" ("profile_id");



CREATE INDEX "board_tasks_assignee_idx" ON "public"."board_tasks" USING "btree" ("assignee_profile_id");



CREATE INDEX "board_tasks_created_by_idx" ON "public"."board_tasks" USING "btree" ("created_by");



CREATE INDEX "board_tasks_open_idx" ON "public"."board_tasks" USING "btree" ("status", "deadline") WHERE ("archived_at" IS NULL);



CREATE INDEX "bvh_login_requests_created_at_idx" ON "public"."bvh_login_requests" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "bvh_login_requests_one_open_per_user" ON "public"."bvh_login_requests" USING "btree" ("user_id") WHERE (NOT "handled");



CREATE INDEX "bvh_login_requests_user_id_idx" ON "public"."bvh_login_requests" USING "btree" ("user_id");



CREATE INDEX "event_registrations_user_id_idx" ON "public"."event_registrations" USING "btree" ("user_id");



CREATE INDEX "events_event_date_idx" ON "public"."events" USING "btree" ("event_date");



CREATE INDEX "finance_export_overrides_profile_id_idx" ON "public"."finance_export_overrides" USING "btree" ("profile_id");



CREATE INDEX "finance_exports_created_at_idx" ON "public"."finance_exports" USING "btree" ("format", "created_at" DESC);



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("E-Mail");



CREATE INDEX "notification_events_created_at_idx" ON "public"."notification_events" USING "btree" ("created_at" DESC);



CREATE INDEX "notification_events_event_id_idx" ON "public"."notification_events" USING "btree" ((("payload" ->> 'event_id'::"text"))) WHERE ("type" = 'event_announcement'::"text");



CREATE INDEX "notification_events_pending_idx" ON "public"."notification_events" USING "btree" ("created_at") WHERE ("sent_at" IS NULL);



CREATE UNIQUE INDEX "profiles_user_id_key" ON "public"."profiles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "alumni_requests_decided" AFTER UPDATE OF "status" ON "public"."alumni_requests" FOR EACH ROW WHEN ((("old"."status" = 'pending'::"text") AND ("new"."status" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])))) EXECUTE FUNCTION "public"."enqueue_alumni_decided"();



CREATE OR REPLACE TRIGGER "alumni_requests_fill_from_profile" BEFORE INSERT ON "public"."alumni_requests" FOR EACH ROW EXECUTE FUNCTION "public"."alumni_request_fill_from_profile"();



CREATE OR REPLACE TRIGGER "alumni_requests_requested" AFTER INSERT ON "public"."alumni_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_alumni_requested"();



CREATE OR REPLACE TRIGGER "bvh_login_requests_fill_from_profile" BEFORE INSERT ON "public"."bvh_login_requests" FOR EACH ROW EXECUTE FUNCTION "public"."bvh_request_fill_from_profile"();



CREATE OR REPLACE TRIGGER "notification_events_dispatch" AFTER INSERT ON "public"."notification_events" FOR EACH ROW EXECUTE FUNCTION "public"."dispatch_notification_event"();



CREATE OR REPLACE TRIGGER "on_pending_registration" AFTER INSERT OR UPDATE OF "data" ON "public"."pending_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_pending_registration"();



CREATE OR REPLACE TRIGGER "profiles_close_alumni_requests" AFTER UPDATE OF "Rolle" ON "public"."profiles" FOR EACH ROW WHEN ((("new"."Rolle" = 'alumni'::"public"."user_role") AND ("old"."Rolle" IS DISTINCT FROM "new"."Rolle"))) EXECUTE FUNCTION "public"."close_alumni_requests_on_role_change"();



CREATE OR REPLACE TRIGGER "profiles_member_cancelled" AFTER UPDATE OF "Status" ON "public"."profiles" FOR EACH ROW WHEN ((("lower"(TRIM(BOTH FROM COALESCE("old"."Status", ''::"text"))) <> 'cancelled'::"text") AND ("lower"(TRIM(BOTH FROM COALESCE("new"."Status", ''::"text"))) = 'cancelled'::"text"))) EXECUTE FUNCTION "public"."enqueue_member_cancelled"();



CREATE OR REPLACE TRIGGER "profiles_member_registered" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_member_registered"();



CREATE OR REPLACE TRIGGER "profiles_sync_auth_ban" AFTER INSERT OR UPDATE OF "Status", "user_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_auth_ban_from_profile"();



CREATE OR REPLACE TRIGGER "profiles_track_iban_change" BEFORE UPDATE OF "IBAN" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_track_iban_change"();



ALTER TABLE ONLY "public"."alumni_requests"
    ADD CONSTRAINT "alumni_requests_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alumni_requests"
    ADD CONSTRAINT "alumni_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alumni_requests"
    ADD CONSTRAINT "alumni_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_task_assignees"
    ADD CONSTRAINT "board_task_assignees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_task_assignees"
    ADD CONSTRAINT "board_task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."board_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_tasks"
    ADD CONSTRAINT "board_tasks_assignee_profile_id_fkey" FOREIGN KEY ("assignee_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."board_tasks"
    ADD CONSTRAINT "board_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bvh_login_requests"
    ADD CONSTRAINT "bvh_login_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."finance_export_overrides"
    ADD CONSTRAINT "finance_export_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_export_overrides"
    ADD CONSTRAINT "finance_export_overrides_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_exports"
    ADD CONSTRAINT "finance_exports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pending_registrations"
    ADD CONSTRAINT "pending_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;





CREATE POLICY "Admins can read all alumni requests" ON "public"."alumni_requests" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin_or_board"() AS "is_admin_or_board"));



CREATE POLICY "Admins can read all bvh requests" ON "public"."bvh_login_requests" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin_or_board"() AS "is_admin_or_board"));



CREATE POLICY "Admins can update bvh requests" ON "public"."bvh_login_requests" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin_or_board"() AS "is_admin_or_board")) WITH CHECK (( SELECT "public"."is_admin_or_board"() AS "is_admin_or_board"));



CREATE POLICY "Nur Admins/Board dürfen Events erstellen" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin_or_board"());



CREATE POLICY "Nur Admins/Board dürfen Events löschen" ON "public"."events" FOR DELETE TO "authenticated" USING ("public"."is_admin_or_board"());



CREATE POLICY "Nur Admins/Board dürfen Events ändern" ON "public"."events" FOR UPDATE TO "authenticated" USING ("public"."is_admin_or_board"()) WITH CHECK ("public"."is_admin_or_board"());



CREATE POLICY "Users can insert own alumni request" ON "public"."alumni_requests" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ( SELECT "public"."is_active_member"() AS "is_active_member")));



CREATE POLICY "Users can insert own bvh request" ON "public"."bvh_login_requests" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ( SELECT "public"."is_active_member"() AS "is_active_member")));



CREATE POLICY "Users can read own alumni requests" ON "public"."alumni_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own bvh requests" ON "public"."bvh_login_requests" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."alumni_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_task_assignees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bvh_login_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_registrations: eigene lesen" ON "public"."event_registrations" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "event_registrations: selbst abmelden" ON "public"."event_registrations" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_active_member"() AS "is_active_member")));



CREATE POLICY "event_registrations: selbst anmelden" ON "public"."event_registrations" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_active_member"() AS "is_active_member") AND (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_registrations"."event_id") AND "e"."requires_registration" AND ("e"."event_date" >= (("now"() AT TIME ZONE 'Europe/Berlin'::"text"))::"date"))))));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events: aktive Mitglieder lesen" ON "public"."events" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_active_member"() AS "is_active_member"));



ALTER TABLE "public"."finance_export_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."finance_exports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "news: Admins und Vorstand erstellen" ON "public"."news" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin_or_board"() AS "is_admin_or_board"));



CREATE POLICY "news: aktive Mitglieder lesen" ON "public"."news" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_active_member"() AS "is_active_member"));



ALTER TABLE "public"."notification_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: eigene Zeile lesen" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








-- Basis: Ein frisches Projekt gibt neuen Tabellen und Funktionen über Default-Privileges volle
-- Rechte für anon/authenticated. Der Dump enthält nur GRANTs, deshalb hier erst alles zurücknehmen;
-- die folgenden GRANTs stellen exakt den Stand der Produktion her.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon", "authenticated";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM PUBLIC, "anon", "authenticated";

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."alumni_request_fill_from_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alumni_request_fill_from_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bvh_request_fill_from_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bvh_request_fill_from_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_alumni_requests_on_role_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_alumni_requests_on_role_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_notification_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_notification_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_alumni_decided"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_alumni_decided"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_alumni_requested"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_alumni_requested"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_event_announcement"("p_event_id" "uuid", "p_payload" "jsonb", "p_cooldown_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_event_announcement"("p_event_id" "uuid", "p_payload" "jsonb", "p_cooldown_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_member_cancelled"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_member_cancelled"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_member_registered"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_member_registered"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_task_deadline_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_task_deadline_reminders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finish_pending_registration"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finish_pending_registration"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_pending_registration"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_pending_registration"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_user_email_confirmed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_user_email_confirmed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_or_board"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_or_board"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_or_board"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."profiles_track_iban_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."profiles_track_iban_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."provision_profile_for_auth_user"("p_user_id" "uuid", "p_link_existing" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_profile_for_auth_user"("p_user_id" "uuid", "p_link_existing" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rate_limit_hit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rate_limit_hit"("p_key" "text", "p_max" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."registration_compact"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registration_compact"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registration_date"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registration_date"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registration_meta_is_redundant"("p_meta" "jsonb", "p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registration_meta_is_redundant"("p_meta" "jsonb", "p_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registration_meta_keys"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registration_meta_keys"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."registration_norm"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registration_norm"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."strip_registration_meta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."strip_registration_meta"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_auth_ban_from_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_auth_ban_from_profile"() TO "service_role";
























GRANT ALL ON TABLE "public"."alumni_requests" TO "anon";
GRANT ALL ON TABLE "public"."alumni_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."alumni_requests" TO "service_role";



GRANT ALL ON TABLE "public"."auth_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."auth_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."auth_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."board_task_assignees" TO "anon";
GRANT ALL ON TABLE "public"."board_task_assignees" TO "authenticated";
GRANT ALL ON TABLE "public"."board_task_assignees" TO "service_role";



GRANT ALL ON TABLE "public"."board_tasks" TO "anon";
GRANT ALL ON TABLE "public"."board_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."board_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."bvh_login_requests" TO "anon";
GRANT ALL ON TABLE "public"."bvh_login_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."bvh_login_requests" TO "service_role";



GRANT ALL ON TABLE "public"."event_registrations" TO "anon";
GRANT ALL ON TABLE "public"."event_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."finance_export_overrides" TO "anon";
GRANT ALL ON TABLE "public"."finance_export_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_export_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."finance_exports" TO "anon";
GRANT ALL ON TABLE "public"."finance_exports" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_exports" TO "service_role";



GRANT ALL ON TABLE "public"."news" TO "anon";
GRANT ALL ON TABLE "public"."news" TO "authenticated";
GRANT ALL ON TABLE "public"."news" TO "service_role";



GRANT ALL ON TABLE "public"."notification_events" TO "anon";
GRANT ALL ON TABLE "public"."notification_events" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_events" TO "service_role";



GRANT ALL ON TABLE "public"."pending_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- ---------------------------------------------------------------------------
-- Ergänzungen außerhalb von public (nicht im Dump enthalten)
-- ---------------------------------------------------------------------------

-- Trigger auf auth.users
CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();
CREATE OR REPLACE TRIGGER "on_auth_user_email_confirmed" AFTER UPDATE OF "email_confirmed_at" ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_user_email_confirmed"();
CREATE OR REPLACE TRIGGER "strip_registration_meta" BEFORE UPDATE ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."strip_registration_meta"();

-- Storage-Buckets
INSERT INTO "storage"."buckets" ("id", "name", "public")
VALUES ('ICR', 'ICR', true)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES ('event-images', 'event-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT ("id") DO NOTHING;

-- Storage-Regeln (Bucket event-images)
DROP POLICY IF EXISTS "Admins dürfen Bilder hochladen" ON "storage"."objects";
CREATE POLICY "Admins dürfen Bilder hochladen" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK ((("bucket_id" = 'event-images'::"text") AND "public"."is_admin_or_board"()));

DROP POLICY IF EXISTS "Admins dürfen Bilder löschen" ON "storage"."objects";
CREATE POLICY "Admins dürfen Bilder löschen" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING ((("bucket_id" = 'event-images'::"text") AND "public"."is_admin_or_board"()));

DROP POLICY IF EXISTS "event-images: Admins lesen" ON "storage"."objects";
CREATE POLICY "event-images: Admins lesen" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING ((("bucket_id" = 'event-images'::"text") AND ( SELECT "public"."is_admin_or_board"() AS "is_admin_or_board")));

-- Cron-Jobs (pg_cron)
SELECT cron.schedule('board-task-deadline-reminders', '0 7 * * *', $cron$select public.enqueue_task_deadline_reminders();$cron$);
SELECT cron.schedule('auth-rate-limits-cleanup', '15 3 * * *', $cron$delete from public.auth_rate_limits where window_start < now() - interval '1 day'$cron$);

-- Sitzungseinstellungen aus dem Dump (search_path, row_security …) nicht an spätere Migrationen vererben.
RESET ALL;
