# Supabase (ICR Intranet)

## Migration: `end_time` auf `public.events`

Diese Migration fügt die Spalte `end_time` hinzu, die die App beim Event-Anlegen nutzt.

### Option A – Supabase Dashboard (schnell)

1. Projekt **Intranet-Database** öffnen.
2. **SQL Editor** → New query.
3. Inhalt von `migrations/20260222120000_add_events_end_time.sql` einfügen und **Run**.

### Option B – Supabase CLI (lokal)

```bash
# Einmalig: https://supabase.com/docs/guides/cli
brew install supabase/tap/supabase   # macOS

cd web
supabase login
supabase link --project-ref <DEIN_PROJECT_REF>

supabase db push
# oder nur Remote ausführen:
supabase db execute --file supabase/migrations/20260222120000_add_events_end_time.sql
```

`project-ref` steht in der Dashboard-URL: `https://supabase.com/dashboard/project/<project-ref>`.

## Hinweis

Die Datei `sql/add_events_end_time.sql` ist identisch zur Migration; die **kanonische** Version für CLI/Push liegt unter `migrations/`.

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
   an das Mitglied selbst geht (`payload.recipient`, Reply-To = Vorstandsadresse).
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
