with users_without_profile as (
  select u.id as user_id, u.email
  from auth.users u
  where u.deleted_at is null
    and not exists (
      select 1
      from public.profiles linked
      where linked.user_id = u.id
    )
),
profile_candidates as (
  select
    p.id as profile_id,
    u.user_id,
    row_number() over (
      partition by u.user_id
      order by p.created_at nulls last, p.id
    ) as candidate_rank
  from users_without_profile u
  join public.profiles p
    on lower(p."E-Mail") = lower(u.email)
   and p.user_id is null
)
update public.profiles p
set user_id = c.user_id
from profile_candidates c
where p.id = c.profile_id
  and c.candidate_rank = 1;
