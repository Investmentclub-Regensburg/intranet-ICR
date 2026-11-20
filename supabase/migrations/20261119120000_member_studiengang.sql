-- Studiengang ändern mit Sperre und Protokoll in einer Transaktion (Studiengang als Auswahl, lib/studiengaenge.ts)
--
-- profiles."Studiengang / Fach" ist Klartext ohne Version. Deshalb Compare-and-set: geschrieben wird nur, wenn die
-- Spalte noch dem gelesenen Stand (p_expected) entspricht. Bei einer Korrektur durch den Vorstand (p_corrected_by)
-- entsteht in derselben Transaktion der Eintrag in member_data_corrections (Feld „studiengang“, nie Werte).
--
-- Aufrufer (alle nur mit Service Role, nach Prüfung in lib/studiengaenge.ts → pruefeStudiengang):
--   * scripts/studiengang.mjs (Bereinigung der Altwerte): p_corrected_by = Vorstand, p_quelle = 'bereinigung'
--   * später Vorstandsfenster (Phase 2):                   p_corrected_by = Vorstand, p_quelle = 'vorstand'
--   * später „Meine Daten“ (Phase 2, eigenes Profil):      ohne p_corrected_by/p_quelle → kein Protokoll
-- p_studiengang null = leeren (Bereinigung unklarer Sammelbegriffe, Entscheidung Hannes 3).
--
-- Rückgabe: true = gespeichert oder nichts zu ändern, false = inzwischen geändert (nichts geschrieben).
-- Dazu member_data_corrections.quelle (neu, optional): woher die Korrektur kam. Bestehende Einträge bleiben null
-- (Vorstandsfenster). Nur additiv, idempotent; nichts für anon/authenticated.

alter table public.member_data_corrections
  add column if not exists quelle text
  constraint member_data_corrections_quelle_check check (quelle is null or quelle in ('vorstand', 'bereinigung'));

comment on column public.member_data_corrections.quelle is
  'Herkunft der Korrektur: vorstand (Vorstandsfenster), bereinigung (Skript), null = älterer Eintrag.';

create or replace function public.save_member_studiengang(
  p_profile_id   uuid,
  p_expected     text,
  p_studiengang  text,
  p_corrected_by uuid default null,
  p_quelle       text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_profile_id is null then
    raise exception 'save_member_studiengang: Profil fehlt';
  end if;
  if p_quelle is not null and p_quelle not in ('vorstand', 'bereinigung') then
    raise exception 'save_member_studiengang: unbekannte Quelle';
  end if;
  if (p_quelle is null) <> (p_corrected_by is null) then
    raise exception 'save_member_studiengang: Quelle und Vorstand nur gemeinsam';
  end if;
  -- Zweite Sicherung neben der Prüfung im Code: getrimmt, nicht leer, höchstens 150 Zeichen, keine Steuerzeichen,
  -- kein Formelanfang (lib/member-fields.ts checkText).
  if p_studiengang is not null and (
       p_studiengang = ''
       or p_studiengang <> btrim(p_studiengang)
       or char_length(p_studiengang) > 150
       or p_studiengang ~ '[[:cntrl:]]'
       or p_studiengang ~ '^[-=+@]'
     ) then
    raise exception 'save_member_studiengang: ungültiger Wert';
  end if;

  if p_studiengang is not distinct from p_expected then
    return true;
  end if;

  update public.profiles p
     set "Studiengang / Fach" = p_studiengang
   where p.id = p_profile_id
     and p."Studiengang / Fach" is not distinct from p_expected;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  if p_corrected_by is not null then
    insert into public.member_data_corrections (profile_id, corrected_by, fields, quelle)
    values (p_profile_id, p_corrected_by, array['studiengang'], p_quelle);
  end if;
  return true;
end;
$$;

revoke execute on function public.save_member_studiengang(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_member_studiengang(uuid, text, text, uuid, text)
  to service_role;
