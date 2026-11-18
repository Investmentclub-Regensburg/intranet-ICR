-- Mitgliederdaten: Land der Anschrift als verschlüsseltes Feld (Paket „Mitgliederdaten“, PR 2)
--
-- Neues Feld member_secrets.land (ISO-Code, z. B. „DE“, verschlüsselt im Format e1. wie die übrigen
-- Felder; lib/member-crypto.ts SECRET_FIELDS). Kein Klartext-Gegenstück in profiles.
--
-- Kompatibilität: save_member_secrets verlangt weiter die 8 bisherigen Felder. Fehlt der Schlüssel
-- „land“ in p_secrets (ältere App-Fassung, Skripte), bleibt der gespeicherte Wert unverändert – nichts
-- wird still geleert. Eine leere Spalte bedeutet „Deutschland“ (die App liest leer als DE und speichert
-- das Land erst beim nächsten Speichern durch Mitglied oder Vorstand).
-- Signatur, Rechte und RLS unverändert; nichts für anon.
--
-- Deploy-Reihenfolge: Migration vor der App (die neue App liest die Spalte land).
-- Idempotent: mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) Spalte
-- ---------------------------------------------------------------------------
alter table public.member_secrets
  add column if not exists land text check (land is null or land ~ '^e1\.[A-Za-z0-9_-]+$');

comment on column public.member_secrets.land is
  'Land der Anschrift (ISO-Code), verschlüsselt (e1.). Leer = Deutschland.';

-- ---------------------------------------------------------------------------
-- 2) Schutz des Datenschlüssels: land gehört zu den Feldern
-- ---------------------------------------------------------------------------
create or replace function public.member_secrets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_id is distinct from old.profile_id then
    raise exception 'member_secrets: profile_id ist unveränderlich';
  end if;
  -- Neuer Datenschlüssel nur bei unveränderten Feldern (Rotation/Rewrap), nie zusammen mit neuen Werten.
  if new.wrapped_dek is distinct from old.wrapped_dek
     and (new.iban, new.bic, new.geburtsdatum, new.strasse, new.hausnummer, new.plz, new.ort, new.handynummer,
          new.land)
         is distinct from
         (old.iban, old.bic, old.geburtsdatum, old.strasse, old.hausnummer, old.plz, old.ort, old.handynummer,
          old.land) then
    raise exception 'member_secrets: Datenschlüssel und Felder dürfen nicht gleichzeitig geändert werden';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke execute on function public.member_secrets_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Speichern: land optional (fehlt der Schlüssel, bleibt der gespeicherte Wert)
-- ---------------------------------------------------------------------------
create or replace function public.save_member_secrets(
  p_profile_id       uuid,
  p_expected_version integer,
  p_wrapped_dek      text,
  p_secrets          jsonb,
  p_iban_hash        text,
  p_iban_last4       text,
  p_iban_changed     boolean,
  p_plain            jsonb,
  p_corrected_by     uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile    public.profiles%rowtype;
  v_old_last4  text;
  v_version    integer;
  v_rows       integer;
  v_fields     text[];
  s            jsonb := coalesce(p_secrets, '{}'::jsonb);
  v_has_land   boolean;
begin
  -- Die 8 bisherigen Felder müssen übergeben werden (fehlende würden sonst still geleert). „land“ ist
  -- optional: ohne den Schlüssel bleibt der gespeicherte Wert stehen.
  if not (s ?& array['iban', 'bic', 'geburtsdatum', 'strasse', 'hausnummer', 'plz', 'ort', 'handynummer']) then
    raise exception 'member_secrets: p_secrets muss alle 8 Felder enthalten';
  end if;
  v_has_land := s ? 'land';

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'member_secrets: Profil % nicht gefunden', p_profile_id;
  end if;

  select ms.iban_last4 into v_old_last4 from public.member_secrets ms where ms.profile_id = p_profile_id;

  if p_expected_version is null then
    insert into public.member_secrets (
      profile_id, wrapped_dek, iban, bic, geburtsdatum, strasse, hausnummer, plz, ort, handynummer, land,
      iban_hash, iban_last4
    ) values (
      p_profile_id, p_wrapped_dek, s->>'iban', s->>'bic', s->>'geburtsdatum', s->>'strasse',
      s->>'hausnummer', s->>'plz', s->>'ort', s->>'handynummer', s->>'land', p_iban_hash, p_iban_last4
    )
    on conflict (profile_id) do nothing
    returning version into v_version;
    get diagnostics v_rows = row_count;
  else
    update public.member_secrets ms
       set iban = s->>'iban', bic = s->>'bic', geburtsdatum = s->>'geburtsdatum', strasse = s->>'strasse',
           hausnummer = s->>'hausnummer', plz = s->>'plz', ort = s->>'ort', handynummer = s->>'handynummer',
           land = case when v_has_land then s->>'land' else ms.land end,
           iban_hash = p_iban_hash, iban_last4 = p_iban_last4
     where ms.profile_id = p_profile_id
       and ms.version = p_expected_version
       and ms.wrapped_dek = p_wrapped_dek
    returning ms.version into v_version;
    get diagnostics v_rows = row_count;
  end if;

  if v_rows = 0 then
    raise exception 'member_secrets_conflict';
  end if;

  if p_iban_changed then
    update public.profiles p set iban_changed_at = now() where p.id = p_profile_id;
  end if;

  -- Protokoll der Korrektur durch den Vorstand: nur Feldnamen, nie Werte.
  if p_corrected_by is not null then
    select coalesce(array_agg(k order by k), '{}') into v_fields
      from jsonb_object_keys(coalesce(p_plain, '{}'::jsonb)) as k;
    insert into public.member_data_corrections (profile_id, corrected_by, fields)
    values (p_profile_id, p_corrected_by, v_fields);
  end if;

  if p_iban_changed then
    insert into public.notification_events (type, profile_id, payload)
    values (
      'iban_changed',
      p_profile_id,
      jsonb_build_object(
        'profile_id',     p_profile_id,
        'vorname',        v_profile."Vorname",
        'nachname',       v_profile."Nachname",
        'email',          v_profile."E-Mail",
        'iban_last4',     p_iban_last4,
        'old_iban_last4', v_old_last4,
        'changed_at',     now(),
        'by_board',       p_corrected_by is not null
      )
    );
  end if;

  return v_version;
end;
$$;

revoke execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_member_secrets(uuid, integer, text, jsonb, text, text, boolean, jsonb, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4) Registrierung: land mit übernehmen (ganzer Satz oder nichts, wie bisher)
-- ---------------------------------------------------------------------------
create or replace function public.adopt_pending_secrets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_secrets (
    profile_id, wrapped_dek, iban, bic, geburtsdatum, strasse, hausnummer, plz, ort, handynummer, land,
    iban_hash, iban_last4
  )
  select p.id,
         r.secrets->>'wrapped_dek',
         r.secrets->'fields'->>'iban',
         r.secrets->'fields'->>'bic',
         r.secrets->'fields'->>'geburtsdatum',
         r.secrets->'fields'->>'strasse',
         r.secrets->'fields'->>'hausnummer',
         r.secrets->'fields'->>'plz',
         r.secrets->'fields'->>'ort',
         r.secrets->'fields'->>'handynummer',
         r.secrets->'fields'->>'land',
         r.secrets->>'iban_hash',
         r.secrets->>'iban_last4'
    from public.pending_registrations r
    join public.profiles p on p.id = r.user_id and p.user_id = r.user_id
   where r.user_id = p_user_id
     and r.secrets is not null
  on conflict (profile_id) do nothing;
exception
  when others then
    raise warning 'adopt_pending_secrets: % – Eintrag bleibt in pending_registrations', sqlstate;
end;
$$;

revoke execute on function public.adopt_pending_secrets(uuid) from public, anon, authenticated;
