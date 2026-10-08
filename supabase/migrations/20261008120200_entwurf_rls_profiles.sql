-- ENTWURF – vor Ausführung gegen Schema-Dump prüfen
--
-- Geprüft gegen den Schema-Export vom 2026-10-08:
--   * Auf profiles gibt es heute genau eine Policy: "Users can view own profile"
--     (SELECT, auth.uid() = user_id). Keine INSERT-/UPDATE-/DELETE-Policy.
--   * Spaltennamen der UPDATE-Rechte stimmen.
--   * profiles.user_id hat weder Unique-Constraint noch Index. Ergänzt unten: Vorprüfung auf
--     mehrfach verknüpfte Konten und ein Unique-Index. Der Index beschleunigt außerdem jede
--     RLS-Prüfung user_id = auth.uid() (auch in is_admin_or_board() und den Policies anderer
--     Tabellen); die App liest das eigene Profil per maybeSingle() und verlässt sich auf Eindeutigkeit.
--   * Produktion ist heute strenger als der erste Entwurf: kein Lesen fremder Zeilen, kein UPDATE
--     über die API. Deshalb sind "Vorstand und Admin lesen alle" und das UPDATE auf eigene
--     Adressspalten jetzt nur noch auskommentierte Optionen. Die App braucht beides nicht (fremde
--     Zeilen und Profiländerungen laufen per Service Role mit Prüfung). Ein UPDATE-Recht über die
--     API würde die serverseitige Validierung der Adressfelder umgehen (CSV-Export).
--
-- Zeilen- und Spaltenrechte für public.profiles festschreiben
--
-- Ziel:
--   * anon: kein Zugriff.
--   * Mitglieder (authenticated) lesen nur die eigene Zeile (user_id = auth.uid()).
--     Wichtig: unabhängig vom Status – Login und Middleware lesen den eigenen Status,
--     um gekündigte Konten abzuweisen.
--   * Kein UPDATE über die API. Die App schreibt Profiländerungen ausschließlich per Service Role
--     (mit Prüfung). Optional (auskommentiert): UPDATE nur auf unkritische Spalten der eigenen
--     Zeile – nie "Rolle", "Status", "Datum_Kündigung", "E-Mail", user_id, IBAN/BIC. Spaltenrechte
--     gelten pro Datenbank-Rolle, nicht pro Policy; ein UPDATE-Recht auf "Rolle" für authenticated
--     würde für die eigene Zeile jedes Mitglieds gelten.
--   * Fremde Zeilen liest nur die Service Role (Server Actions mit Rollenprüfung). Optional
--     (auskommentiert): Vorstand liest alle Zeilen über die API.
--   * INSERT/DELETE nur über Trigger (security definer) und Service Role.
--
-- Vor der Ausführung:
--   1. Bestehende Policies sichern – dieser Entwurf ENTFERNT ALLE Policies auf profiles:
--        select policyname, cmd, roles, qual, with_check from pg_policies
--        where schemaname = 'public' and tablename = 'profiles';
--   2. Spaltennamen gegen den Schema-Dump prüfen (Schreibweise, Umlaute, Anführungszeichen).
--   3. In einer Staging-Umgebung mit dem JWT eines Testmitglieds gegenprüfen:
--        GET  /rest/v1/profiles?select=id,IBAN            → nur eigene Zeile
--        PATCH /rest/v1/profiles?user_id=eq.<eigene-id>  {"Rolle":"board"}  → Fehler/0 Zeilen
--        GET  /rest/v1/profiles  ohne Login (anon)        → Fehler/leer
--      und die App durchklicken (Login, Profil, Events, Admin-Bereich als board).
--
-- Ausführen: wie Entwurf 20261008120000 (Zeile "set icr.apply_drafts = on;" voranstellen).

do $$
begin
  if coalesce(current_setting('icr.apply_drafts', true), '') <> 'on' then
    raise exception 'ENTWURF – vor Ausführung gegen Schema-Dump prüfen (set icr.apply_drafts = on)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: Rolle des aktuellen Kontos (nur aktive Profile).
-- security definer, damit die Policy auf profiles nicht rekursiv auf sich selbst prüft.
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(p."Rolle"::text))
  from public.profiles p
  where p.user_id = auth.uid()
    and lower(trim(coalesce(p."Status"::text, ''))) not in ('cancelled', 'applicant')
  limit 1
$$;

revoke execute on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS einschalten, alle bisherigen Policies entfernen
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', r.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tabellen- und Spaltenrechte
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;

grant select on public.profiles to authenticated;

-- Optional (nicht empfohlen): nur falls Mitglieder ihre Adresse künftig ohne Service Role ändern
-- sollen. Umgeht die serverseitige Validierung; dann zusätzlich die UPDATE-Policy unten aktivieren.
-- grant update ("Straße", "Hausnummer", "PLZ", "Ort", "Handynummer", "letzter_news_aufruf")
--   on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- user_id eindeutig (ein Konto = höchstens ein Profil)
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
begin
  select count(*) into n
    from (
      select user_id
        from public.profiles
       where user_id is not null
       group by user_id
      having count(*) > 1
    ) d;
  if n > 0 then
    raise exception 'profiles.user_id: % Konten sind mit mehreren Profilen verknüpft – vorher bereinigen: select user_id, count(*) from public.profiles where user_id is not null group by 1 having count(*) > 1', n;
  end if;
end $$;

create unique index if not exists profiles_user_id_key on public.profiles (user_id);

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy "profiles: eigene Zeile lesen"
  on public.profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Optional (nicht empfohlen): Lesen aller Profile inkl. IBAN über die API. Heute in Produktion
-- nicht möglich, von der App nicht gebraucht; ein gekapertes Admin-Konto käme sonst per API an
-- alle Bankdaten, obwohl die Exporte nur dem Vorstand offenstehen.
-- create policy "profiles: Vorstand liest alle"
--   on public.profiles
--   for select
--   to authenticated
--   using ((select public.current_profile_role()) = 'board');

-- Optional (nicht empfohlen), nur zusammen mit dem Spaltenrecht oben:
-- create policy "profiles: eigene Zeile ändern (nur freigegebene Spalten)"
--   on public.profiles
--   for update
--   to authenticated
--   using (user_id = (select auth.uid()))
--   with check (user_id = (select auth.uid()));
