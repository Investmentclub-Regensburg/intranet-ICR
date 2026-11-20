-- Fehlende Namen aus der E-Mail-Adresse setzen (Bereinigung, Entscheidung Hannes 20.11.2026)
--
-- Aufrufer: nur scripts/namen.mjs (Service Role) nach Ableitung und Prüfung in lib/name-aus-email.ts.
-- Setzt Vor- UND Nachnamen eines Profils, bei dem beide leer sind. Compare-and-set: geschrieben wird nur, wenn die
-- Spalten noch genau dem gelesenen Stand entsprechen UND dieser Stand leer ist (null oder nur Leerraum). In derselben
-- Transaktion entsteht der Eintrag in member_data_corrections (Felder vorname/nachname, Quelle „bereinigung“, nie
-- Werte).
--
-- Eigene Funktion statt eines zusätzlichen Parameters an save_member_name: Eine zweite Fassung mit p_quelle wäre
-- eine Überladung mit gleichen Parameternamen – Aufrufe der App (sechs benannte Parameter) wären dann nicht mehr
-- eindeutig. save_member_name bleibt unverändert.
--
-- Rückgabe: true = gespeichert, false = inzwischen geändert, nicht mehr leer oder Profil fehlt (nichts geschrieben).
-- Nur Service Role; nichts für anon/authenticated. Nur additiv, idempotent.

create or replace function public.save_member_name_bereinigung(
  p_profile_id        uuid,
  p_expected_vorname  text,
  p_expected_nachname text,
  p_vorname           text,
  p_nachname          text,
  p_corrected_by      uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_profile_id is null or p_corrected_by is null then
    raise exception 'save_member_name_bereinigung: Profil oder Vorstand fehlt';
  end if;
  -- Zweite Sicherung neben der Prüfung im Code (lib/member-rules.ts pruefeName): getrimmt, nicht leer, höchstens
  -- 100 Zeichen, keine Steuerzeichen, keine Ziffern, kein Formelanfang.
  if p_vorname is null or p_nachname is null
     or p_vorname = '' or p_nachname = ''
     or p_vorname <> btrim(p_vorname) or p_nachname <> btrim(p_nachname)
     or char_length(p_vorname) > 100 or char_length(p_nachname) > 100
     or p_vorname ~ '[[:cntrl:]0-9]' or p_nachname ~ '[[:cntrl:]0-9]'
     or p_vorname ~ '^[-=+@]' or p_nachname ~ '^[-=+@]' then
    raise exception 'save_member_name_bereinigung: ungültiger Wert';
  end if;
  -- Nur leere Namen werden gesetzt (der erwartete Stand muss leer sein).
  if coalesce(p_expected_vorname, '') !~ '^\s*$' or coalesce(p_expected_nachname, '') !~ '^\s*$' then
    return false;
  end if;

  update public.profiles p
     set "Vorname" = p_vorname, "Nachname" = p_nachname
   where p.id = p_profile_id
     and p."Vorname" is not distinct from p_expected_vorname
     and p."Nachname" is not distinct from p_expected_nachname;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  -- Protokoll nur mit einem aktiven Vorstandsprofil; sonst bricht die Transaktion ab (das Update oben wird
  -- zurückgenommen).
  if not exists (
    select 1 from public.profiles b
     where b.id = p_corrected_by
       and lower(btrim(coalesce(b."Rolle", ''))) = 'board'
       and lower(btrim(coalesce(b."Status", ''))) <> 'cancelled'
  ) then
    raise exception 'save_member_name_bereinigung: kein aktives Vorstandsprofil';
  end if;

  insert into public.member_data_corrections (profile_id, corrected_by, fields, quelle)
  values (p_profile_id, p_corrected_by, array['vorname', 'nachname'], 'bereinigung');
  return true;
end;
$$;

revoke execute on function public.save_member_name_bereinigung(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.save_member_name_bereinigung(uuid, text, text, text, text, uuid)
  to service_role;
