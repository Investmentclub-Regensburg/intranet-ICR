-- E-Mail-Änderung durch das Mitglied (Mein Profil → Meine Daten).
--
-- Die App startet die Änderung mit supabase.auth.updateUser({ email }). Supabase schickt die Bestätigung
-- (bei „Secure email change“ an alte und neue Adresse) und setzt auth.users.email erst nach der Bestätigung.
-- Dieser Trigger zieht dann die Adresse im Profil nach ("E-Mail" ist die Adresse für Vorstandsmails,
-- Exporte und Verteiler).
--
-- Ist die neue Adresse schon einem anderen Profil zugeordnet (Unique "profiles_Email_key") oder schlägt das
-- Update aus einem anderen Grund fehl, bleibt das Profil unverändert: Die Bestätigung im Auth-Konto soll daran
-- nicht scheitern. Die App prüft die Adresse vor dem Start der Änderung; der Fall landet sonst als Warnung im Log.
--
-- Idempotent: mehrfach ausführbar.

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or new.email is not distinct from old.email then
    return null;
  end if;

  begin
    update public.profiles
       set "E-Mail" = new.email
     where user_id = new.id
       and "E-Mail" is distinct from new.email;
  exception
    when unique_violation then
      raise warning 'sync_profile_email_from_auth: Adresse bereits einem anderen Profil zugeordnet (Konto %)', new.id;
    when others then
      raise warning 'sync_profile_email_from_auth: Profil nicht aktualisiert (Konto %, %)', new.id, sqlstate;
  end;

  return null;
end;
$$;

revoke execute on function public.sync_profile_email_from_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email_from_auth();
