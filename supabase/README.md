# Supabase (ICR Intranet)

## Umgebungen

| Umgebung | Supabase-Projekt | Wer nutzt es | Daten |
|---|---|---|---|
| Lokal (`next dev`), Tests | `Intranet-Test` (`rkegvieoejmyutkowwwf`) | `.env.local` | nur erfunden (`seed.sql`) |
| CI | `supabase start` (Docker auf dem GitHub-Runner) | `.github/workflows/ci.yml` | nur erfunden |
| Produktion | `Intranet-Database` (`vxcwtfktnefreboejgpw`) | Vercel, Branch `prod` | echte Mitglieder |
| Produktion ab dem Umzug (Nov. 2026) | eigener Stack auf dataserver01 (`http://10.0.0.3:8100`, nur privates Netz) | Coolify (webserver01), Branch `prod` | echte Mitglieder |

`next dev` bricht ab, wenn `.env.local` auf die Produktion zeigt (`next.config.ts`).

## Migrationen

**Ablauf:** Feature-Branch → PR nach `dev` (CI grün) → Merge → Migration läuft automatisch ins
Test-Projekt (`.github/workflows/test-db.yml`) → Release-PR `dev` → `prod` → Merge → die
Supabase-GitHub-Integration spielt neue Migrationen in die Produktion ein.

**Regeln:**
- Schemaänderungen nur als neue Datei unter `migrations/` (`supabase migration new <name>`).
  **Nie** im SQL-Editor oder per `supabase db push` in der Produktion – sonst läuft die Migration beim
  Merge ein zweites Mal. Ist es doch passiert: sofort
  `supabase migration repair --db-url "<prod>" --status applied <version>`.
  Gilt bis zum Umzug auf den eigenen Server; danach ist `supabase db push` nach dem Merge der vorgesehene Weg
  (Abschnitt „Produktion“).
- `migrations/20261011200000_baseline.sql` ist der Stand der Produktion vom 11.10.2026 und dort als
  eingespielt markiert. Nie ändern (die CI prüft die Prüfsumme). Ältere Dateien: `migrations_archive/`
  (nur zur Nachvollziehbarkeit, werden nicht mehr ausgeführt).
- Neue Migrationen müssen neuer sein als alle vorhandenen und dürfen bestehende nicht ändern (CI).
- Destruktive Befehle (`DROP TABLE/COLUMN/SCHEMA`, `TRUNCATE`, `DELETE FROM`, Typänderungen) lässt die
  CI nur mit dem PR-Label `destructive-ok` durch. Vorher Daten der Produktion sichern.
- Abwärtskompatibel bauen: Vercel und Supabase deployen gleichzeitig. Erst hinzufügen, Code umstellen,
  Altes in einem späteren Release entfernen.
- Vor dem PR gegen das Test-Projekt testen – **per `psql -1 -f <datei>` direkt, nicht per
  `supabase db push`** (Verbindung: `supabase/.temp/pooler-url`, Passwort im Schlüsselbund).
  Ein `db push` trägt die Migration in den Verlauf des Test-Projekts ein; solange sie noch nicht auf
  `dev` ist, bricht dann der Workflow „Test-DB“ ab („Remote migration versions not found“). Migrationen
  müssen ohnehin mehrfach ausführbar sein; nach dem Merge trägt der Workflow sie regulär ein.
  Prüfen, dass die CLI mit dem Test-Projekt verknüpft ist: `cat supabase/.temp/project-ref` muss
  `rkegvieoejmyutkowwwf` zeigen. Die CLI **nie** mit der
  Produktion verknüpfen – `supabase db reset --linked` würde dort alles löschen.

### Produktion

**Bis zum Umzug** (Supabase Cloud): wie oben, die Supabase-GitHub-Integration spielt Migrationen beim Merge
nach `prod` ein.

**Ab dem Umzug** (eigener Stack auf dataserver01) gibt es keine GitHub-Integration mehr. Migrationen werden
nach dem Merge nach `prod` von Hand eingespielt, ohne neuen Automatismus:

1. **Erst die Migration einspielen (Schritte 2 bis 4, vom Stand des Release-Branches aus), dann den
   Release-PR `dev` → `prod` mergen** (CI grün; Coolify deployt die App beim Merge). Migrationen bleiben
   abwärtskompatibel, d. h. die alte App läuft mit der neuen Datenbank weiter; umgekehrt gilt das nicht immer
   (z. B. liest die App seit `20261118120000_member_secrets_land.sql` die Spalte `member_secrets.land`; sie
   kommt zwar übergangsweise ohne sie aus, speichert dann aber kein Land).
2. Vorher eine Sicherung: `docker exec icr-db pg_dump -U supabase_admin -d postgres -Fc > …` auf dataserver01
   (oder den letzten nächtlichen Dump prüfen).
3. SSH-Tunnel zur Datenbank (nur Tailnet, Postgres lauscht dort nur auf `127.0.0.1:5433`):
   ```bash
   ssh -N -L 5433:127.0.0.1:5433 dataserver01
   ```
4. Erst ansehen, dann einspielen (vom Stand `prod` aus, Passwort `POSTGRES_PASSWORD` aus der `.env` des Stacks,
   Vaultwarden; nicht in die Shell-Historie schreiben):
   ```bash
   supabase migration list --db-url "postgresql://postgres:<pw>@localhost:5433/postgres"
   supabase db push --dry-run --db-url "postgresql://postgres:<pw>@localhost:5433/postgres"
   supabase db push --db-url "postgresql://postgres:<pw>@localhost:5433/postgres"
   ```
   `db push` trägt die Versionen in `supabase_migrations.schema_migrations` ein (Verlauf aus der Cloud wurde beim
   Umzug übernommen). Die CLI nie per `supabase link` mit der Produktion verknüpfen.
5. Abfrage „Stimmen deine Daten noch?“ (`20261118140000_member_data_confirmation.sql`,
   `20261118150000_member_data_confirm.sql`): erst beide Migrationen, dann die App. Eingeschaltet wird sie in
   der App-Umgebung (Coolify) mit **beiden** Werten: `DATA_CHECK_ENABLED=true` und `DATA_CHECK_START=<Datum des
   Einschaltens, YYYY-MM-DD>`. Ohne gültiges Start-Datum zählt für „Später“ nur der letzte Stichtag (liegt er über
   4 Wochen zurück, gibt es für niemanden „Später“); die App warnt dann einmal im Server-Log.
6. Edge Function `notify-board` geändert? Auf dem eigenen Stack liegt sie unter `/opt/icr-supabase/functions`
   (Ablage siehe Stack-Doku bei setup); nach dem Kopieren `docker compose restart functions`.

**Test-Projekt neu aufbauen:** `supabase db reset --linked` (nur mit Link auf das Test-Projekt). Danach
die Passwörter der Testkonten setzen (siehe Kommentar in `seed.sql`). Vault-Secrets für Mails im
Test-Projekt nie auf die Produktion zeigen lassen.

## Events

Migration: `migrations_archive/20261003120000_events_overhaul.sql`

- `description`, `location`, `organizer`, `event_time`, `end_time` sind optional; `end_time` ist vom Typ `time`.
  Liegt `end_time` vor `event_time`, endet das Event am Folgetag.
- Schreibrechte auf `events` und Uploads in den Bucket `event-images` (max. 5 MB, nur Bilder) nur für
  `admin`/`board` (`public.is_admin_or_board()`). Bilder lädt die App hoch (`POST /api/event-image`, mit der
  Sitzung der Person, die Storage-Regel greift also weiter) nach `<user_id>/<uuid>.<ext>` und liefert sie unter
  `/bilder/event-images/<pfad>` selbst aus; der Browser spricht nie direkt mit Supabase. `events.image_url`
  enthält bei neuen Bildern diesen App-Pfad, bei alten noch die absolute Storage-URL (beides wird verstanden,
  `lib/events.ts`).
- Anmelden geht nur bei Events mit `requires_registration`, die noch nicht vorbei sind.
- Jedes Event hat eine teilbare Detailseite `/events/<id>`. Nicht eingeloggte Besucher landen nach dem Login dort.

### Teilnehmerzahl, Schließen, Warteliste

Migration: `migrations/20261108120000_event_capacity_waitlist.sql`

- `events.max_participants` (null = unbegrenzt) und `events.registration_closed` (manuell geschlossen) setzen
  Admin/Vorstand beim Bearbeiten bzw. auf `/admin/events/<id>`. Die Zahl darf nicht unter die bestehenden
  Anmeldungen sinken (Trigger `events_capacity_change`).
- Anmelden läuft über `public.event_join(event_id)`: unter einer Sperre auf der Event-Zeile → `registered`
  oder, wenn ausgebucht, `waitlisted` (Tabelle `event_waitlist`). Der Trigger `event_registrations_capacity`
  begrenzt zusätzlich jedes direkte Insert.
- Nachrücken automatisch (`event_fill_from_waitlist`) bei Abmeldung, höherer Teilnehmerzahl oder Wiederöffnen,
  solange die Anmeldung offen ist (nicht geschlossen, bis einschließlich Starttag). Wer nachrückt, bekommt
  eine Mail (Typ `event_waitlist_promoted`). Bei geschlossener Anmeldung bleibt Abmelden möglich, nachgerückt
  wird erst nach dem Wiederöffnen.
- Die Edge Function `notify-board` muss den Typ `event_waitlist_promoted` kennen: **vor** dem Release nach
  `prod` neu deployen, sonst landet die Mail als Testmail beim Vorstand statt beim Mitglied.

### Event-Mail an Mitglieder

Beim Anlegen (oder später auf `/admin/events/<id>` → „Mail senden“) schreibt die Server Action eine Zeile
vom Typ `event_announcement` in die Outbox `notification_events`. `payload.recipients` enthält entweder alle
Mitglieder mit Rolle `member`/`admin`/`board` und Status ≠ `cancelled` oder die einzeln eingegebenen Adressen.
Die Edge Function verschickt jede Mail einzeln adressiert in Resend-Batches à 100 (`/emails/batch`), im Hintergrund
(`EdgeRuntime.waitUntil`). Fortschritt steht in `payload.sent_count`; ein Retry setzt dort fort.

Das Event-Bild bettet die Mail über die App ein (`<INTRANET_URL>/bilder/event-images/<pfad>`), nicht über
Supabase-Storage. Die Function versteht dabei den neuen App-Pfad und alte Storage-URLs. Reihenfolge beim
Release: erst die App (Route `/bilder/…` muss erreichbar sein), dann die Function neu deployen. Eine ältere
Function verschickt Mails zu neuen Events weiter, nur ohne Bild.

## Vorstands-Benachrichtigungen (Registrierung, Kündigung, Alumni-Antrag)

Migration: `migrations_archive/20260920120000_board_notifications.sql`
Edge Function: `functions/notify-board/index.ts`

### Ablauf

1. Trigger auf `profiles` (INSERT → Registrierung, `Status` → `cancelled` → Kündigung) und auf
   `alumni_requests` (INSERT → Alumni-Antrag) schreiben je eine Zeile in die Outbox
   `notification_events`.
2. Ein Trigger auf `notification_events` ruft per `pg_net` die Edge Function `notify-board` auf.
   URL und Shared Secret liest er aus dem Supabase Vault (`notify_board_url`, `notify_board_secret`).
3. Die Edge Function lädt das Event mit der Service Role, verschickt die Mail über Resend an
   `NOTIFY_TO_EMAIL` und setzt `sent_at` bzw. `last_error`/`attempts`.
4. Wird ein Alumni-Antrag entschieden (`alumni_requests.status` → `approved`/`rejected`, egal ob über
   die Admin-Seite oder indirekt über das Rollen-Dropdown), entsteht ein Event `alumni_decided`, das
   an das Mitglied selbst geht (Adresse aus `profiles."E-Mail"` zu `payload.user_id`, ersatzweise die
   Adresse des Auth-Kontos; Reply-To = Vorstandsadresse).
   Migration: `migrations_archive/20260921090000_alumni_decision_mail.sql`.

Fehlt ein Vault-Secret, bleibt das Event mit `sent_at = null` in der Outbox liegen; es geht nichts verloren.

### Einmalige Einrichtung

**Vault (SQL Editor):**

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify-board', 'notify_board_url');
select vault.create_secret('<zufälliges Secret, z. B. openssl rand -hex 32>', 'notify_board_secret');
```

**Edge-Function-Secrets** (Dashboard → Edge Functions → Secrets, oder `supabase secrets set`):

| Secret | Pflicht | Bedeutung |
|---|---|---|
| `NOTIFY_BOARD_SECRET` | ja | identisch mit dem Vault-Secret `notify_board_secret` |
| `RESEND_API_KEY` | ja | Resend API-Key |
| `NOTIFY_TO_EMAIL` | nein | Empfänger, kommasepariert (Default `info@investmentclubregensburg.com`) |
| `NOTIFY_CANCELLATION_EMAIL` | nein | Empfänger der Kündigungsmails und Antwortadresse der Kündigungsbestätigung an das Mitglied (Default `kuendigung@investmentclubregensburg.com`) |
| `NOTIFY_FROM_EMAIL` | nein | Absender, Domain muss in Resend verifiziert sein (Default `ICR Intranet <intranet@myicr.investmentclubregensburg.com>`) |
| `INTRANET_URL` | nein | Basis-URL des Intranets für Links in der Mail (Default `https://myicr.investmentclubregensburg.com`) |

**Deploy:** Die Function läuft mit `verify_jwt = false`; die Absicherung ist der Header `x-notify-secret`.
Bei einem Deploy per CLI deshalb `supabase functions deploy notify-board --no-verify-jwt`.

### Test & Betrieb

```sql
-- Test-Mail auslösen (landet als Typ "test" in der Outbox und wird sofort verschickt)
insert into public.notification_events (type, payload) values ('test', '{"quelle":"manuell"}');

-- Offene / fehlgeschlagene Events
select id, type, created_at, attempts, last_error from public.notification_events
where sent_at is null order by created_at;

-- Letzte Webhook-Aufrufe (pg_net)
select id, status_code, content::text, created from net._http_response order by id desc limit 10;
```

Health-Check (zeigt Secret-Namen, Resend-Domains, Empfänger/Absender – keine Werte):

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/notify-board" \
  -H "x-notify-secret: <secret>" -H "Content-Type: application/json" -d '{"action":"health"}'
```

Fehlgeschlagene Events erneut zustellen: die Function ohne `event_id` aufrufen, sie arbeitet bis zu 20 offene Events ab.

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/notify-board" \
  -H "x-notify-secret: <secret>" -H "Content-Type: application/json" -d '{}'
```
