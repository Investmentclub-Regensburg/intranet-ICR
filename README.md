This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Betrieb auf eigenem Server (setup)

Ab dem Umzug (November 2026) läuft das Intranet nicht mehr auf Vercel + Supabase Cloud, sondern als
Docker-Image auf dem Server von setup (Coolify, webserver01) gegen einen eigenen Supabase-Stack im privaten
Netz. Bis zum Umzugsabend bleibt Vercel in Betrieb; der Code läuft auf beiden Umgebungen gleich.

**Grundsatz:** Der Browser spricht nie direkt mit Supabase. Alle Supabase-Aufrufe laufen serverseitig
(Server Components, Server Actions, Route Handler, Middleware). Dafür liefert die App selbst aus bzw. nimmt an:

| Was | Wo |
|---|---|
| Abmelden | Server Action `logoutAction` (`app/login/actions.ts`) |
| Event-Bild hochladen | `POST /api/event-image` (Route Handler, Admin/Vorstand, max. 5 MB, Typ per Magic Bytes geprüft) |
| Event-Bild anzeigen | `GET /bilder/event-images/<pfad>` (öffentlich, holt die Datei serverseitig aus dem Bucket `event-images`) |
| Logo in den Auth-Mails | `public/icr-mail-logo.png` (Vorlagen zeigen auf `{{ .SiteURL }}/icr-mail-logo.png`). **Fehlt noch:** Kopie von `ICR/icr.png` aus dem Cloud-Bucket, vor dem Umzug ablegen |
| Healthcheck | `GET /api/health` (ohne Datenbank) |

`events.image_url` speichert neue Bilder als `/bilder/event-images/<pfad>`. Ältere Zeilen enthalten noch die
absolute Cloud-Adresse `https://<ref>.supabase.co/storage/v1/object/public/event-images/<pfad>`; Anzeige,
Löschen und Event-Mails verstehen beide Formate (`lib/events.ts`, `eventImageStoragePath`).

### Build

```bash
docker build -t icr-intranet \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://10.0.0.3:8100 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key des eigenen Stacks> \
  --build-arg NEXT_PUBLIC_SITE_URL=https://myicr.investmentclubregensburg.com \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site-key> .
docker run -p 3000:3000 --env-file <laufzeit.env> icr-intranet
```

- `output: "standalone"` (nur außerhalb von Vercel, `next.config.ts`), Node 22 wie in der CI, läuft als Benutzer
  `node`, Port 3000, `HEALTHCHECK` auf `/api/health`.
- Das Dockerfile setzt beim Build `ICR_HOSTING=self`. Damit lässt die Produktionssperre in `next.config.ts`
  einen Build mit Produktionsdaten zu (wie `VERCEL` auf Vercel). Lokal nie setzen.
- In Coolify: Build Pack „Dockerfile“, Port 3000. Die vier `NEXT_PUBLIC_*` als **Build-Variable** markieren
  (Next.js setzt sie beim Build fest ein; eine Änderung braucht einen neuen Build). Alle übrigen Variablen nur
  zur Laufzeit, **nie** als Build-Variable (sie stünden sonst in der Image-Historie).

### Umgebungsvariablen

| Variable | Art | Wann | Wert auf dem eigenen Server |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | öffentlich* | Build (+ Laufzeit) | `http://10.0.0.3:8100` (Kong, nur privates Netz) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | öffentlich* | Build (+ Laufzeit) | `ANON_KEY` aus der `.env` des Stacks |
| `NEXT_PUBLIC_SITE_URL` | öffentlich | Build (+ Laufzeit) | `https://myicr.investmentclubregensburg.com` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | öffentlich | Build (+ Laufzeit) | wie bisher |
| `SUPABASE_SERVICE_ROLE_KEY` | **geheim** | Laufzeit | `SERVICE_ROLE_KEY` aus der `.env` des Stacks |
| `MEMBER_DATA_MASTER_KEY`, `MEMBER_DATA_MASTER_KEY_ID`, `MEMBER_DATA_OLD_MASTER_KEYS` | **geheim** | Laufzeit | 1:1 wie bisher auf Vercel (sonst sind die Mitgliedsdaten nicht lesbar) |
| `TURNSTILE_SECRET_KEY` | **geheim** | Laufzeit | wie bisher |
| `SUPABASE_AUTH_CAPTCHA` | – | Laufzeit | **leer**: Im eigenen Stack ist das Captcha in GoTrue aus, die App prüft Turnstile selbst |
| `SEPA_CREDITOR_NAME`, `SEPA_CREDITOR_IBAN`, `SEPA_CREDITOR_BIC`, `SEPA_CREDITOR_ID` | **geheim** | Laufzeit | wie bisher |
| `WHATSAPP_INVITE_URL` | **geheim** | Laufzeit | wie bisher |

\* Seit dem Umzug nur noch serverseitig genutzt (der Browser lädt keinen Supabase-Code mehr), heißen aber
weiter `NEXT_PUBLIC_*`, damit Vercel bis zum Umzug unverändert läuft. Werte nur über Vaultwarden übertragen.

Vom Image selbst gesetzt: `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, `PORT=3000`, `HOSTNAME=0.0.0.0`.

### Hinweise

- **Supabase ist von außen nicht erreichbar.** Die URL `http://10.0.0.3:8100` gilt nur im privaten Hetzner-Netz
  (webserver01 → dataserver01). Mail-Links zeigen auf die App (`/auth/confirm`), nicht auf Supabase.
- **Client-IP:** `clientIp()` (`lib/bot-protection.ts`) nimmt den ersten Eintrag aus `X-Forwarded-For`. Hinter
  Traefik nach dem Umzug einmal prüfen, dass dort die echte Besucher-IP steht (Rate-Limits je IP).
- **Migrationen** in die Produktion: `supabase/README.md`, Abschnitt „Produktion“.
- **Verschlüsselungsprüfung** gegen den eigenen Stack: `npm run verschluesselung -- pruefen --projekt prod
  --url http://localhost:8100` über einen SSH-Tunnel (`ssh -N -L 8100:10.0.0.3:8100 dataserver01`).
- Vercel-Teile (`vercel.json`, `VERCEL`/`VERCEL_ENV` in `next.config.ts`) bleiben bis zum Aufräumen nach dem Umzug.
