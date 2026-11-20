-- Mitgliederdaten: Name ändern mit Sperre und Protokoll in einer Transaktion (Paket „Mitgliederdaten“, PR 2)
--
-- Name (profiles."Vorname"/"Nachname") ändern Mitglied und Vorstand selbst (Entscheidung Hannes 11). profiles hat
-- keine Version, deshalb Compare-and-set: geschrieben wird nur, wenn der Name noch dem gelesenen Stand entspricht.
-- Bei einer Korrektur durch den Vorstand (p_corrected_by) entsteht in derselben Transaktion der Eintrag in
-- member_data_corrections (nur Feldnamen, nie Werte).
-- Rückgabe: true = gespeichert oder nichts zu ändern, false = inzwischen geändert (nichts geschrieben).
-- Nur Service Role; nichts für anon/authenticated. Nur additiv, idempotent.

create or replace function public.save_member_name(
  p_profile_id        uuid,
  p_expected_vorname  text,
  p_expected_nachname text,
  p_vorname           text,
  p_nachname          text,
  p_corrected_by      uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := '{}';
  v_rows   integer;
begin
  if p_nachname is distinct from p_expected_nachname then
    if p_nachname is null or btrim(p_nachname) = '' then
      raise exception 'save_member_name: Nachname darf nicht leer sein';
    end if;
    v_fields := v_fields || 'nachname'::text;
  end if;
  if p_vorname is distinct from p_expected_vorname then
    if p_vorname is null or btrim(p_vorname) = '' then
      raise exception 'save_member_name: Vorname darf nicht leer sein';
    end if;
    v_fields := v_fields || 'vorname'::text;
  end if;
  if cardinality(v_fields) = 0 then
    return true;
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

  if p_corrected_by is not null then
    insert into public.member_data_corrections (profile_id, corrected_by, fields)
    values (p_profile_id, p_corrected_by, v_fields);
  end if;
  return true;
end;
$$;

revoke execute on function public.save_member_name(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.save_member_name(uuid, text, text, text, text, uuid)
  to service_role;
