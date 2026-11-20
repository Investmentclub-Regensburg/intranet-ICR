-- E-Mail ändern: Stand der Bestätigung für das eigene Konto (Fenster „Bestätige in beiden Postfächern“)
--
-- GoTrue (double_confirm_changes / GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED) schickt je einen Link an die alte und
-- die neue Adresse. Welcher schon bestätigt ist, steht nur in auth.users (email_change_confirm_status,
-- email_change_token_current/_new) und nicht im User-JSON der Auth-API (dort nur new_email). Diese Funktion liefert
-- dazu für auth.uid() ausschließlich Booleans und eine Zahl, nie Tokens oder Adressen:
--   offen                  Änderung angefragt (email_change gesetzt)
--   alt_bestaetigt         Link an die bisherige Adresse geklickt (Token der alten Adresse verbraucht)
--   neu_bestaetigt         Link an die neue Adresse geklickt (Token der neuen Adresse verbraucht)
--   gesendet_vor_sekunden  Sekunden seit dem letzten Versand (Gültigkeit der Links, Sendebremse), sonst null
-- Nach dem zweiten Link setzt GoTrue alles zurück (offen = false).
-- Nur authenticated; nichts für anon. Nur additiv, idempotent.

create or replace function public.email_change_stand()
returns table (
  offen boolean,
  alt_bestaetigt boolean,
  neu_bestaetigt boolean,
  gesendet_vor_sekunden integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(u.email_change, '') <> '' as offen,
    coalesce(u.email_change, '') <> ''
      and coalesce(u.email_change_confirm_status, 0) = 1
      and coalesce(u.email_change_token_current, '') = '' as alt_bestaetigt,
    coalesce(u.email_change, '') <> ''
      and coalesce(u.email_change_confirm_status, 0) = 1
      and coalesce(u.email_change_token_new, '') = '' as neu_bestaetigt,
    case
      when u.email_change_sent_at is null then null
      else greatest(0, floor(extract(epoch from (now() - u.email_change_sent_at))))::integer
    end as gesendet_vor_sekunden
  from auth.users u
  where u.id = auth.uid();
$$;

revoke execute on function public.email_change_stand() from public, anon;
grant execute on function public.email_change_stand() to authenticated;
