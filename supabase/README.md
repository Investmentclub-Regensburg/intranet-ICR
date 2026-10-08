# Supabase (ICR Intranet)

## Migrationen

Alle Schemaänderungen liegen unter `migrations/` und sind idempotent. Ausführen per Supabase CLI
(`supabase link --project-ref <ref>` → `supabase db push`) oder Inhalt im SQL Editor einfügen.

**Entwürfe:** Dateien mit `_entwurf_` im Namen sind noch nicht freigegeben. Sie beginnen mit dem
Kommentar „ENTWURF – vor Ausführung gegen Schema-Dump prüfen“ und brechen ab, solange in derselben
Sitzung nicht `set icr.apply_drafts = on;` gesetzt ist (ein `supabase db push` stoppt deshalb an der
ersten Entwurfsdatei). Nach Prüfung den Schutzblock entfernen oder die Zeile voranstellen.

## Events

Migration: `migrations/20261003120000_events_overhaul.sql`

- `description`, `location`, `organizer`, `event_time`, `end_time` sind optional; `end_time` ist vom Typ `time`.
  Liegt `end_time` vor `event_time`, endet das Event am Folgetag.
- Schreibrechte auf `events` und Uploads in den Bucket `event-images` (max. 5 MB, nur Bilder) nur für
  `admin`/`board` (`public.is_admin_or_board()`). Bilder lädt der Browser direkt nach `<user_id>/<uuid>.<ext>`.
- Anmelden geht nur bei Events mit `requires_registration`, die noch nicht vorbei sind.
- Jedes Event hat eine teilbare Detailseite `/events/<id>`. Nicht eingeloggte Besucher landen nach dem Login dort.

### Event-Mail an Mitglieder

Beim Anlegen (oder später auf `/admin/events/<id>` → „Mail senden“) schreibt die Server Action eine Zeile
vom Typ `event_announcement` in die Outbox `notification_events`. `payload.recipients` enthält entweder alle
Mitglieder mit Rolle `member`/`admin`/`board` und Status ≠ `cancelled` oder die einzeln eingegebenen Adressen.
Die Edge Function verschickt jede Mail einzeln adressiert in Resend-Batches à 100 (`/emails/batch`), im Hintergrund
(`EdgeRuntime.waitUntil`). Fortschritt steht in `payload.sent_count`; ein Retry setzt dort fort.

## Vorstands-Benachrichtigungen (Registrierung, Kündigung, Alumni-Antrag)

Migration: `migrations/20260920120000_board_notifications.sql`
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
   Migration: `migrations/20260921090000_alumni_decision_mail.sql`.

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
