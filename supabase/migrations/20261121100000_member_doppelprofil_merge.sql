-- Doppelprofile zusammenführen (Entscheidung Hannes 20.11.2026)
--
-- Befund (Probe-DB 18.11.): Paare von Profilen mit derselben E-Mail-Adresse, die sich nur in Groß-/Kleinschreibung
-- (bzw. Leerzeichen am Rand) unterscheidet:
--   A = vom Login-Konto angelegtes Profil (id = user_id, ohne Namen, ohne verschlüsselte Daten)
--   B = importiertes Profil (Name, IBAN in member_secrets, Mitgliedsnummer, echtes Antragsdatum, kein Konto)
-- Zusammenführen heißt: B bleibt, das Konto von A wird an B gehängt, A wird gelöscht.
--
-- 1) merge_member_doppelprofil(): ein Paar in EINER Transaktion zusammenführen. Aufrufer: nur
--    scripts/doppelprofile.mjs (Service Role) nach der Einstufung in scripts/lib/doppelprofile.mjs. Die Funktion
--    prüft das Muster ein zweites Mal (gleiche Kriterien wie die Einstufung, siehe dort) und macht Compare-and-set
--    auf den gelesenen Stand beider Profile. Was nicht exakt passt, bleibt unverändert.
-- 2) enqueue_member_cancelled(): keine Vorstandsmail, wenn die Kündigung beim Zusammenführen von A nach B
--    übernommen wird (die Mail zur Kündigung ging schon, als A gekündigt hat).
-- 3) provision_profile_for_auth_user(): E-Mail-Vergleich zusätzlich ohne Leerzeichen am Rand (lower(btrim())),
--    passend zum neuen Unique-Index auf lower(btrim("E-Mail")) (Migration 20261121110000).
--
-- Rückgabe von merge_member_doppelprofil (nie Werte, nur Codes):
--   zusammengefuehrt             Konto an B, A gelöscht
--   zusammengefuehrt_kuendigung  dazu Kündigung von A übernommen (Status, Datum_Kündigung)
--   konflikt                     A oder B hat sich seit dem Lesen geändert (nichts geschrieben)
--   muster                       Paar entspricht nicht (mehr) dem Muster (nichts geschrieben)
--   verweise                     A hat Verweise, die die Funktion nicht umhängen kann (nichts geschrieben)
--   fehlt                        A oder B gibt es nicht (mehr)
--
-- Enthält DELETE in einer Funktion (A löschen, doppelte Aufgaben-Zuständigkeit) → PR braucht das Label
-- destructive-ok. Nur Service Role; nichts für anon/authenticated. Idempotent.

-- ---------------------------------------------------------------------------
-- 1) Compare-and-set: Stand eines Profils wie vom Skript gelesen (PostgREST-JSON)
-- ---------------------------------------------------------------------------
create or replace function public.merge_member_doppelprofil_stand(p public.profiles, e jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select e ?& array['user_id', 'E-Mail', 'Status', 'Datum_Kündigung', 'Vorname', 'Nachname', 'Rolle',
                    'Mitgliedsnummer', 'Datum_Mandat', 'letzter_news_aufruf']
     and (e->>'user_id')::uuid is not distinct from p.user_id
     and (e->>'E-Mail') is not distinct from p."E-Mail"
     and (e->>'Status') is not distinct from p."Status"
     and (e->>'Datum_Kündigung')::date is not distinct from p."Datum_Kündigung"
     and (e->>'Vorname') is not distinct from p."Vorname"
     and (e->>'Nachname') is not distinct from p."Nachname"
     and (e->>'Rolle') is not distinct from p."Rolle"::text
     and (e->>'Mitgliedsnummer') is not distinct from p."Mitgliedsnummer"
     and (e->>'Datum_Mandat')::date is not distinct from p."Datum_Mandat"
     and (e->>'letzter_news_aufruf')::timestamptz is not distinct from p.letzter_news_aufruf;
$$;

revoke all on function public.merge_member_doppelprofil_stand(public.profiles, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Zusammenführen
-- ---------------------------------------------------------------------------
create or replace function public.merge_member_doppelprofil(
  p_konto_profil  uuid,   -- A: Profil mit Login-Konto (wird gelöscht)
  p_import_profil uuid,   -- B: importiertes Profil (bleibt, bekommt das Konto)
  p_expected      jsonb,  -- { "a": {…}, "b": {…} } Stand beim Lesen (Spalten wie merge_member_doppelprofil_stand)
  p_corrected_by  uuid    -- Vorstandsprofil für das Protokoll
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a            public.profiles%rowtype;
  b            public.profiles%rowtype;
  u            record;
  v_key        text;
  v_a_cancel   boolean;
  v_b_cancel   boolean;
  v_kuendigung boolean;
  v_b_hash     text;
  v_news       timestamptz;
  v_datum      date;
  v_fields     text[] := array['doppelprofil', 'konto'];
  v_hit        boolean;
  fk           record;
begin
  if p_konto_profil is null or p_import_profil is null or p_corrected_by is null
     or p_konto_profil = p_import_profil
     or p_corrected_by in (p_konto_profil, p_import_profil)
     or jsonb_typeof(p_expected->'a') is distinct from 'object'
     or jsonb_typeof(p_expected->'b') is distinct from 'object' then
    raise exception 'merge_member_doppelprofil: Parameter fehlen oder ungültig';
  end if;

  -- Protokoll nur mit einem aktiven Vorstandsprofil.
  if not exists (
    select 1 from public.profiles v
     where v.id = p_corrected_by
       and v."Rolle"::text = 'board'
       and lower(btrim(coalesce(v."Status", ''))) <> 'cancelled'
  ) then
    raise exception 'merge_member_doppelprofil: kein aktives Vorstandsprofil';
  end if;

  -- Beide Profile sperren (feste Reihenfolge gegen Deadlocks), dann lesen.
  perform 1 from public.profiles p where p.id in (p_konto_profil, p_import_profil) order by p.id for update;
  select * into a from public.profiles where id = p_konto_profil;
  if not found then return 'fehlt'; end if;
  select * into b from public.profiles where id = p_import_profil;
  if not found then return 'fehlt'; end if;

  -- Compare-and-set: Abbruch, wenn sich A oder B seit dem Lesen geändert hat.
  if not public.merge_member_doppelprofil_stand(a, p_expected->'a')
     or not public.merge_member_doppelprofil_stand(b, p_expected->'b') then
    return 'konflikt';
  end if;

  -- ---- Muster (gleiche Kriterien wie scripts/lib/doppelprofile.mjs → stufeEin) ----
  v_key := lower(btrim(a."E-Mail"));
  v_a_cancel := lower(btrim(coalesce(a."Status", ''))) = 'cancelled';
  v_b_cancel := lower(btrim(coalesce(b."Status", ''))) = 'cancelled';
  v_kuendigung := v_a_cancel and not v_b_cancel;

  if a.user_id is null or b.user_id is not null or a.id is distinct from a.user_id
     -- gleiche Adresse, und genau diese zwei Profile haben sie
     or v_key is null or v_key = '' or v_key is distinct from lower(btrim(b."E-Mail"))
     or (select count(*) from public.profiles p where lower(btrim(p."E-Mail")) = v_key) <> 2
     -- A ohne Namen, B mit Vor- und Nachnamen
     or coalesce(a."Vorname", '') !~ '^\s*$' or coalesce(a."Nachname", '') !~ '^\s*$'
     or coalesce(b."Vorname", '') ~ '^\s*$' or coalesce(b."Nachname", '') ~ '^\s*$'
     -- A ohne Daten (keine verschlüsselten Felder, keine Klartext-IBAN, keine Mitgliedsnummer, kein Mandat)
     or coalesce(a."IBAN", '') !~ '^\s*$'
     or coalesce(a."Mitgliedsnummer", '') !~ '^\s*$'
     or a."Datum_Mandat" is not null
     or exists (
          select 1 from public.member_secrets ms
           where ms.profile_id = a.id
             and (ms.iban is not null or ms.bic is not null or ms.geburtsdatum is not null or ms.strasse is not null
                  or ms.hausnummer is not null or ms.plz is not null or ms.ort is not null
                  or ms.handynummer is not null or ms.land is not null))
     -- B mit IBAN
     or not exists (select 1 from public.member_secrets ms where ms.profile_id = b.id and ms.iban is not null)
     -- Status: kein Antrag offen; B gekündigt nur, wenn A auch gekündigt hat
     or lower(btrim(coalesce(a."Status", ''))) = 'applicant'
     or lower(btrim(coalesce(b."Status", ''))) = 'applicant'
     or (v_b_cancel and not v_a_cancel)
     -- Kündigung übernehmen nur mit Datum und nicht für Vorstand/Admin
     or (v_kuendigung and (a."Datum_Kündigung" is null or b."Rolle"::text in ('board', 'admin')))
     -- Rolle von A: Vorgabe (member) oder gleich B
     or (a."Rolle" is not null and a."Rolle"::text <> 'member' and a."Rolle" is distinct from b."Rolle")
     -- B ist das ältere Profil (Import vor Kontoanlage)
     or b.created_at > a.created_at
     -- keine offene Registrierung zum Konto
     or exists (select 1 from public.pending_registrations r where r.user_id = a.user_id) then
    return 'muster';
  end if;

  -- IBAN-Gruppe: B teilt den IBAN-Fingerabdruck mit einem anderen Profil → Vorstand prüft.
  select ms.iban_hash into v_b_hash from public.member_secrets ms where ms.profile_id = b.id;
  if v_b_hash is not null and exists (
    select 1 from public.member_secrets ms
     where ms.iban_hash = v_b_hash and ms.profile_id not in (a.id, b.id)
  ) then
    return 'muster';
  end if;

  -- Konto: gleiche Adresse, Sperre passt zu A (gekündigt ⇔ gesperrt). Dann ändert der Trigger
  -- profiles_sync_auth_ban beim Umhängen nichts: B bekommt denselben Status-Zustand wie A.
  select usr.id, usr.email, usr.banned_until into u from auth.users usr where usr.id = a.user_id for update;
  if not found
     or lower(btrim(coalesce(u.email, ''))) is distinct from v_key
     or coalesce(u.banned_until >= '2999-12-31 00:00:00+00'::timestamptz, false) is distinct from v_a_cancel then
    return 'muster';
  end if;

  -- ---- Verweise auf A, die nicht umgehängt werden können ----
  -- Finanz-Anpassung für dasselbe Semester bei A und B: welche gilt? → Vorstand.
  if exists (
    select 1 from public.finance_export_overrides x
      join public.finance_export_overrides y
        on y.semester = x.semester and y.year = x.year and y.profile_id = b.id
     where x.profile_id = a.id
  ) then
    return 'verweise';
  end if;
  -- Fremdschlüssel auf profiles, die diese Funktion nicht kennt (z. B. aus späteren Migrationen): Hat A dort
  -- Zeilen, wird nichts angefasst.
  for fk in
    select n.nspname as schema_name, c.relname as table_name, att.attname as column_name
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.profiles'::regclass
       and cardinality(con.conkey) = 1
       and (n.nspname, c.relname, att.attname::text) not in (
         ('public', 'member_secrets', 'profile_id'),
         ('public', 'membership_cancellations', 'profile_id'),
         ('public', 'member_data_corrections', 'profile_id'),
         ('public', 'member_data_corrections', 'corrected_by'),
         ('public', 'alumni_requests', 'profile_id'),
         ('public', 'board_task_assignees', 'profile_id'),
         ('public', 'board_tasks', 'assignee_profile_id'),
         ('public', 'board_tasks', 'created_by'),
         ('public', 'finance_export_overrides', 'profile_id')
       )
  loop
    execute format('select exists (select 1 from %I.%I where %I = $1)', fk.schema_name, fk.table_name, fk.column_name)
      into v_hit using a.id;
    if v_hit then
      return 'verweise';
    end if;
  end loop;
  if exists (
    select 1 from pg_constraint con
     where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass and cardinality(con.conkey) <> 1
  ) then
    return 'verweise';
  end if;

  -- ---- Schreiben ----
  -- Kennzeichen für enqueue_member_cancelled (nur diese Transaktion): keine zweite Vorstandsmail.
  perform set_config('app.doppelprofil_merge', 'on', true);

  -- Verweise von A auf B umhängen.
  update public.membership_cancellations set profile_id = b.id where profile_id = a.id;
  update public.member_data_corrections set profile_id = b.id where profile_id = a.id;
  update public.member_data_corrections set corrected_by = b.id where corrected_by = a.id;
  update public.alumni_requests set profile_id = b.id where profile_id = a.id;
  delete from public.board_task_assignees x
   where x.profile_id = a.id
     and exists (select 1 from public.board_task_assignees y where y.task_id = x.task_id and y.profile_id = b.id);
  update public.board_task_assignees set profile_id = b.id where profile_id = a.id;
  update public.board_tasks set assignee_profile_id = b.id where assignee_profile_id = a.id;
  update public.board_tasks set created_by = b.id where created_by = a.id;
  update public.finance_export_overrides set profile_id = b.id where profile_id = a.id;

  -- A löschen (vor dem Umhängen: Unique user_id und Unique E-Mail). Kaskade nur noch auf die leere
  -- member_secrets-Zeile von A (falls vorhanden); alle anderen Verweise hängen jetzt an B.
  delete from public.profiles where id = a.id;

  -- Konto an B. letzter_news_aufruf: der spätere. Kündigung von A übernehmen, falls nur A gekündigt hat; sind
  -- beide gekündigt, bleibt das Datum von B (fehlt es, das von A).
  v_news := greatest(a.letzter_news_aufruf, b.letzter_news_aufruf);
  v_datum := case
               when v_kuendigung then a."Datum_Kündigung"
               when v_a_cancel and v_b_cancel then coalesce(b."Datum_Kündigung", a."Datum_Kündigung")
               else b."Datum_Kündigung"
             end;
  if u.email is distinct from b."E-Mail" then v_fields := v_fields || 'email'::text; end if;
  if v_news is distinct from b.letzter_news_aufruf then v_fields := v_fields || 'letzter_news_aufruf'::text; end if;
  if v_kuendigung then v_fields := v_fields || 'status'::text; end if;
  if v_datum is distinct from b."Datum_Kündigung" then v_fields := v_fields || 'datum_kuendigung'::text; end if;

  update public.profiles p
     set user_id = a.user_id,
         "E-Mail" = u.email,
         letzter_news_aufruf = v_news,
         "Status" = case when v_kuendigung then 'cancelled' else p."Status" end,
         "Datum_Kündigung" = v_datum
   where p.id = b.id;

  insert into public.member_data_corrections (profile_id, corrected_by, fields, quelle)
  values (b.id, p_corrected_by, v_fields, 'bereinigung');

  perform set_config('app.doppelprofil_merge', '', true);
  return case when v_kuendigung then 'zusammengefuehrt_kuendigung' else 'zusammengefuehrt' end;
end;
$$;

revoke all on function public.merge_member_doppelprofil(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.merge_member_doppelprofil(uuid, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Vorstandsmail „Kündigung“: nicht beim Zusammenführen
--    (Fassung aus 20261012150000_membership_cancellations.sql, nur die Abfrage am Anfang ist neu)
-- ---------------------------------------------------------------------------
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
  -- Zusammenführen von Doppelprofilen (merge_member_doppelprofil): Die Kündigung ist schon gemeldet.
  if coalesce(current_setting('app.doppelprofil_merge', true), '') = 'on' then
    return new;
  end if;

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
-- 4) Profil zum Konto: Adresse ohne Groß-/Kleinschreibung UND ohne Leerzeichen am Rand vergleichen
--    (Fassung aus 20261021120000_member_plaintext_cleanup.sql, nur die beiden Vergleiche sind neu)
-- ---------------------------------------------------------------------------
create or replace function public.provision_profile_for_auth_user(p_user_id uuid, p_link_existing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u               auth.users%rowtype;
  meta            jsonb;
  semester_number integer;
  sepa_confirmed  boolean;
  statute_accepted boolean;
begin
  select * into u from auth.users where id = p_user_id;
  if not found or u.email is null then
    return;
  end if;

  -- Konto ist bereits mit einem Profil verknüpft.
  if exists (select 1 from public.profiles p where p.user_id = u.id) then
    return;
  end if;

  -- Es gibt schon ein Profil mit dieser E-Mail-Adresse (ohne Groß-/Kleinschreibung, ohne Leerzeichen am Rand –
  -- wie der Unique-Index profiles_email_lower_key).
  if exists (select 1 from public.profiles p where lower(btrim(p."E-Mail")) = lower(btrim(u.email))) then
    if p_link_existing then
      update public.profiles
         set user_id = u.id
       where id = (
         select p2.id
           from public.profiles p2
          where lower(btrim(p2."E-Mail")) = lower(btrim(u.email))
            and p2.user_id is null
          order by p2.created_at nulls last, p2.id
          limit 1
       );
    end if;
    -- Kein zweites Profil mit derselben E-Mail-Adresse anlegen.
    return;
  end if;

  -- Neues Profil aus den Registrierungsdaten. Sensible Angaben kommen nur verschlüsselt
  -- (adopt_pending_secrets), nie als Klartext.
  meta := (coalesce(u.raw_user_meta_data, '{}'::jsonb)
           || coalesce((select r.data from public.pending_registrations r where r.user_id = u.id), '{}'::jsonb))
          - array['IBAN', 'BIC', 'Geburtsdatum', 'Straße', 'Hausnr', 'PLZ', 'Ort', 'Handynummer'];

  if (meta->>'Semester') ~ '^\d{1,2}$' then
    semester_number := (meta->>'Semester')::integer;
  end if;

  sepa_confirmed := lower(coalesce(meta->>'Sepa-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');
  statute_accepted := lower(coalesce(meta->>'Vereinsatzung-Bestätigung', 'false')) in ('true', 't', '1', 'yes', 'on');

  insert into public.profiles (
    "id", "user_id", "E-Mail", "Status", "Rolle", "Datum_Antrag",
    "Vorname", "Nachname", "Studiengang / Fach", "Abschluss", "Semester", "Hochschulart",
    "Sepa-Bestätigung", "Datum_Mandat", "Vereinsatzung-Bestätigung"
  )
  values (
    u.id, u.id, u.email, 'active', 'member', current_date,
    left(meta->>'Vorname', 100),
    left(meta->>'Nachname', 100),
    left(meta->>'Fach', 150),
    left(meta->>'Abschluss', 150),
    semester_number,
    left(meta->>'Uni/OTH', 150),
    sepa_confirmed,
    case when sepa_confirmed then current_date end,
    statute_accepted
  );
end;
$$;

revoke all on function public.provision_profile_for_auth_user(uuid, boolean) from public, anon, authenticated;
grant execute on function public.provision_profile_for_auth_user(uuid, boolean) to service_role;
