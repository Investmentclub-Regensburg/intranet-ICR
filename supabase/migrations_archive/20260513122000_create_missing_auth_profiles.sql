insert into public.profiles (
  id,
  user_id,
  "E-Mail",
  "Status",
  "Rolle",
  "Datum_Antrag",
  "Vorname",
  "Nachname"
)
select
  u.id,
  u.id,
  u.email,
  'active',
  'member',
  coalesce(u.created_at::date, current_date),
  nullif(u.raw_user_meta_data->>'Vorname', ''),
  nullif(u.raw_user_meta_data->>'Nachname', '')
from auth.users u
where u.deleted_at is null
  and not exists (
    select 1
    from public.profiles p
    where p.user_id = u.id
  )
  and not exists (
    select 1
    from public.profiles p
    where lower(p."E-Mail") = lower(u.email)
  )
on conflict ("E-Mail") do nothing;
