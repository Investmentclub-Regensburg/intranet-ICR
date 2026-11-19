-- Mitgliederdaten: Bestätigung an den geprüften Stand binden (Paket „Mitgliederdaten“, PR 4, Review A2)
--
-- confirm_member_data setzt daten_bestaetigt_am (und leert daten_erinnern_ab) nur, wenn member_secrets.version
-- noch der Version entspricht, die die App gerade gelesen und geprüft hat (keine Zeile = 0). Sperrreihenfolge wie
-- save_member_secrets: zuerst die profiles-Zeile (for update), dann member_secrets lesen. Damit kann keine
-- Korrektur durch den Vorstand dazwischenkommen (sie wartet oder kommt vorher, dann false), auch nicht das erste
-- Anlegen der Zeile, und beide Funktionen können sich nicht gegenseitig blockieren (kein Deadlock).
-- Rückgabe: true = bestätigt, false = inzwischen geändert (nichts geschrieben).
-- Nur Service Role; nichts für anon/authenticated. Nur additiv, idempotent.

create or replace function public.confirm_member_data(p_profile_id uuid, p_expected_version integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_rows    integer;
begin
  if p_profile_id is null or p_expected_version is null then
    raise exception 'confirm_member_data: Profil und Version sind Pflicht';
  end if;

  perform 1 from public.profiles p where p.id = p_profile_id for update;
  if not found then
    return false;
  end if;

  select ms.version into v_version
    from public.member_secrets ms
   where ms.profile_id = p_profile_id;

  if coalesce(v_version, 0) <> p_expected_version then
    return false;
  end if;

  update public.profiles p
     set daten_bestaetigt_am = now(),
         daten_erinnern_ab   = null
   where p.id = p_profile_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke execute on function public.confirm_member_data(uuid, integer) from public, anon, authenticated;
grant execute on function public.confirm_member_data(uuid, integer) to service_role;
