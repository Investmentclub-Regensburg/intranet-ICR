-- Doppelprofile: ausdrückliche Freigabe einzelner Paare (Entscheidung Hannes 20.11.2026)
--
-- merge_member_doppelprofil() bekommt den optionalen Parameter p_freigabe text[]: die Gründe, die der Vorstand für
-- GENAU dieses Paar aufhebt. Aufrufer ist nur scripts/doppelprofile.mjs mit `--freigabe <A-ID>:<B-ID>`; das Skript
-- übergibt je Paar nur die Gründe, die dort wirklich vorliegen. Erlaubt sind nur:
--   rolle_b_vorstand  Import-Profil (B) ist board/admin → Rolle von B bleibt
--   iban_gruppe       IBAN-Fingerabdruck von B auch bei einem anderen Profil → an der IBAN ändert sich nichts
--   a_hat_namen       Konto-Profil (A) hat einen Namen → Namen von B bleiben, die von A nur, wo B leer ist
-- Jeder andere Grund (inkl. Compare-and-set) sperrt unverändert. Ohne p_freigabe verhält sich die Funktion genau wie
-- in 20261121100000 (bis auf die Namensregel, die ohne Freigabe nie greift, weil A dann keinen Namen hat).
--
-- E-Mail: Das verbleibende Profil bekommt wie bisher exakt die Adresse des Login-Kontos (auth.users.email); das
-- Protokoll nennt dann „email“. Neu im Protokoll: „freigabe“ + „freigabe_<grund>“ je aufgehobenem Grund sowie
-- „vorname“/„nachname“, falls ein Name von A übernommen wurde.
--
-- Die Fassung mit 4 Parametern wird ersetzt (sonst wäre ein Aufruf mit 4 Parametern mehrdeutig). Enthält DELETE in
-- der Funktion (wie 20261121100000) → PR braucht das Label destructive-ok. Nur Service Role. Idempotent.

drop function if exists public.merge_member_doppelprofil(uuid, uuid, jsonb, uuid);

create or replace function public.merge_member_doppelprofil(
  p_konto_profil  uuid,   -- A: Profil mit Login-Konto (wird gelöscht)
  p_import_profil uuid,   -- B: importiertes Profil (bleibt, bekommt das Konto)
  p_expected      jsonb,  -- { "a": {…}, "b": {…} } Stand beim Lesen (Spalten wie merge_member_doppelprofil_stand)
  p_corrected_by  uuid,   -- Vorstandsprofil für das Protokoll
  p_freigabe      text[] default null  -- ausdrücklich freigegebene Gründe für GENAU dieses Paar (siehe oben)
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
  v_frei_rolle boolean;
  v_frei_iban  boolean;
  v_frei_namen boolean;
  v_vorname    text;
  v_nachname   text;
begin
  -- Freigabe: nur die drei bekannten Codes, jeder höchstens einmal, keine leeren Werte.
  if p_freigabe is not null and (
       array_position(p_freigabe, null) is not null
       or exists (select 1 from unnest(p_freigabe) f(code)
                   where f.code not in ('rolle_b_vorstand', 'iban_gruppe', 'a_hat_namen'))
       or cardinality(p_freigabe) <> (select count(distinct f.code) from unnest(p_freigabe) f(code))
     ) then
    raise exception 'merge_member_doppelprofil: Freigabe ungültig';
  end if;
  v_frei_rolle := coalesce('rolle_b_vorstand' = any (p_freigabe), false);
  v_frei_iban  := coalesce('iban_gruppe' = any (p_freigabe), false);
  v_frei_namen := coalesce('a_hat_namen' = any (p_freigabe), false);

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
  -- Auch die verschlüsselten Daten sperren: Sonst könnte zwischen Prüfung und Löschen von A eine IBAN in die
  -- (leere) Zeile von A geschrieben und von der Kaskade gelöscht werden.
  perform 1 from public.member_secrets ms
   where ms.profile_id in (p_konto_profil, p_import_profil) order by ms.profile_id for update;
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
     -- A ohne Namen (außer mit Freigabe a_hat_namen), B mit Vor- und Nachnamen
     or (not v_frei_namen and (coalesce(a."Vorname", '') !~ '^\s*$' or coalesce(a."Nachname", '') !~ '^\s*$'))
     or coalesce(b."Vorname", '') ~ '^\s*$' or coalesce(b."Nachname", '') ~ '^\s*$'
     -- A ohne Daten (keine verschlüsselten Felder, keine Klartext-IBAN, keine Mitgliedsnummer, kein Mandat)
     or coalesce(a."IBAN", '') !~ '^\s*$'
     or coalesce(a."Mitgliedsnummer", '') !~ '^\s*$'
     or a."Datum_Mandat" is not null
     -- A hat in keiner anderen Spalte einen Wert, den B nicht genauso hat (Spalten zur Laufzeit; die Liste der
     -- behandelten Spalten ist gleich BEHANDELTE_SPALTEN in scripts/lib/doppelprofile.mjs)
     or exists (
          select 1 from jsonb_each(to_jsonb(a)) as w(k, v)
           where w.k <> all (array['id', 'user_id', 'E-Mail', 'Status', 'Rolle', 'Vorname', 'Nachname',
                                   'Mitgliedsnummer', 'Datum_Kündigung', 'Datum_Mandat', 'Datum_Antrag', 'IBAN',
                                   'letzter_news_aufruf', 'created_at'])
             and w.v <> 'null'::jsonb
             and w.v <> 'false'::jsonb
             and not (jsonb_typeof(w.v) = 'string' and (w.v #>> '{}') ~ '^\s*$')
             and w.v is distinct from coalesce(to_jsonb(b) -> w.k, 'null'::jsonb))
     or exists (
          select 1 from public.member_secrets ms
           where ms.profile_id = a.id
             and (ms.iban is not null or ms.bic is not null or ms.geburtsdatum is not null or ms.strasse is not null
                  or ms.hausnummer is not null or ms.plz is not null or ms.ort is not null
                  or ms.handynummer is not null or ms.land is not null))
     -- B mit IBAN
     or not exists (select 1 from public.member_secrets ms where ms.profile_id = b.id and ms.iban is not null)
     -- Status beider Profile nur active oder cancelled; B gekündigt nur, wenn A auch gekündigt hat
     or lower(btrim(coalesce(a."Status", ''))) not in ('active', 'cancelled')
     or lower(btrim(coalesce(b."Status", ''))) not in ('active', 'cancelled')
     or (v_b_cancel and not v_a_cancel)
     -- Kündigung übernehmen nur mit Datum und nur bei einer Selbstkündigung (Grund-Eintrag zu A)
     or (v_kuendigung and (a."Datum_Kündigung" is null
                           or not exists (select 1 from public.membership_cancellations mc where mc.profile_id = a.id)))
     -- nie automatisch Vorstands- oder Adminrechte an ein Konto hängen (außer mit Freigabe rolle_b_vorstand)
     or (not v_frei_rolle and b."Rolle"::text in ('board', 'admin'))
     -- Rolle von A: Vorgabe (member) oder gleich B
     or (a."Rolle" is not null and a."Rolle"::text <> 'member' and a."Rolle" is distinct from b."Rolle")
     -- B ist das ältere Profil (Import vor Kontoanlage)
     or b.created_at > a.created_at
     -- keine offene Registrierung zum Konto
     or exists (select 1 from public.pending_registrations r where r.user_id = a.user_id) then
    return 'muster';
  end if;

  -- IBAN-Gruppe: B teilt den IBAN-Fingerabdruck mit einem anderen Profil → Vorstand prüft (außer mit Freigabe
  -- iban_gruppe; an der IBAN ändert die Funktion ohnehin nie etwas).
  select ms.iban_hash into v_b_hash from public.member_secrets ms where ms.profile_id = b.id;
  if not v_frei_iban and v_b_hash is not null and exists (
    select 1 from public.member_secrets ms
     where ms.iban_hash = v_b_hash and ms.profile_id not in (a.id, b.id)
  ) then
    return 'muster';
  end if;

  -- Konto: bestätigt, gleiche Adresse, Sperre passt zu A (gekündigt ⇔ gesperrt). Dann ändert der Trigger
  -- profiles_sync_auth_ban beim Umhängen nichts: B bekommt denselben Status-Zustand wie A.
  select usr.id, usr.email, usr.banned_until, usr.email_confirmed_at into u
    from auth.users usr where usr.id = a.user_id for update;
  if not found
     or u.email_confirmed_at is null
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
  -- Namen: die von B bleiben; die von A nur, wo B leer ist (B ohne Namen ist ohnehin „muster“).
  v_vorname  := case when coalesce(b."Vorname", '') ~ '^\s*$' then a."Vorname" else b."Vorname" end;
  v_nachname := case when coalesce(b."Nachname", '') ~ '^\s*$' then a."Nachname" else b."Nachname" end;
  if v_vorname is distinct from b."Vorname" then v_fields := v_fields || 'vorname'::text; end if;
  if v_nachname is distinct from b."Nachname" then v_fields := v_fields || 'nachname'::text; end if;
  -- Freigabe im Protokoll: welche Gründe der Vorstand für dieses Paar aufgehoben hat.
  if p_freigabe is not null and cardinality(p_freigabe) > 0 then
    v_fields := v_fields || 'freigabe'::text
                || array(select 'freigabe_' || f.code from unnest(p_freigabe) f(code) order by f.code);
  end if;

  update public.profiles p
     set user_id = a.user_id,
         "E-Mail" = u.email,
         "Vorname" = v_vorname,
         "Nachname" = v_nachname,
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

revoke all on function public.merge_member_doppelprofil(uuid, uuid, jsonb, uuid, text[]) from public, anon, authenticated;
grant execute on function public.merge_member_doppelprofil(uuid, uuid, jsonb, uuid, text[]) to service_role;
