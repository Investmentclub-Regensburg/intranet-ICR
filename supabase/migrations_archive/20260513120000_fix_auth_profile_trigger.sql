create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  existing_profile_id uuid;
  birth_date date;
  semester_number integer;
  sepa_confirmed boolean;
begin
  select p.id
  into existing_profile_id
  from public.profiles p
  where lower(p."E-Mail") = lower(new.email)
    and (p.user_id is null or p.user_id = new.id)
  order by
    case
      when p.user_id = new.id then 0
      when p.user_id is null then 1
      else 2
    end,
    p.created_at nulls last
  limit 1;

  if existing_profile_id is not null then
    update public.profiles
    set user_id = new.id
    where id = existing_profile_id;

    return new;
  end if;

  if (new.raw_user_meta_data->>'Geburtsdatum') ~ '^\d{4}-\d{2}-\d{2}$' then
    birth_date := (new.raw_user_meta_data->>'Geburtsdatum')::date;
  end if;

  if (new.raw_user_meta_data->>'Semester') ~ '^\d+$' then
    semester_number := (new.raw_user_meta_data->>'Semester')::integer;
  end if;

  sepa_confirmed := lower(coalesce(new.raw_user_meta_data->>'Sepa-Bestätigung', 'false'))
    in ('true', 't', '1', 'yes', 'on');

  insert into public.profiles (
    "id",
    "user_id",
    "E-Mail",
    "Status",
    "Rolle",
    "Datum_Antrag",
    "Vorname",
    "Nachname",
    "Geburtsdatum",
    "Straße",
    "Hausnummer",
    "Ort",
    "PLZ",
    "Handynummer",
    "Studiengang / Fach",
    "Abschluss",
    "Semester",
    "Hochschulart",
    "IBAN",
    "BIC",
    "Sepa-Bestätigung"
  )
  values (
    new.id,
    new.id,
    new.email,
    'active',
    'member',
    current_date,
    new.raw_user_meta_data->>'Vorname',
    new.raw_user_meta_data->>'Nachname',
    birth_date,
    new.raw_user_meta_data->>'Straße',
    new.raw_user_meta_data->>'Hausnr',
    new.raw_user_meta_data->>'Ort',
    new.raw_user_meta_data->>'PLZ',
    new.raw_user_meta_data->>'Handynummer',
    new.raw_user_meta_data->>'Fach',
    new.raw_user_meta_data->>'Abschluss',
    semester_number,
    new.raw_user_meta_data->>'Uni/OTH',
    new.raw_user_meta_data->>'IBAN',
    new.raw_user_meta_data->>'BIC',
    sepa_confirmed
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
