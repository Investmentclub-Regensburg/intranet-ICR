# syntax=docker/dockerfile:1
#
# Image für den Betrieb auf dem eigenen Server (setup, Coolify auf webserver01). Ablauf, ENV-Liste und
# Build-Argumente: README.md, Abschnitt „Betrieb auf eigenem Server (setup)“.
#
#   docker build -t icr-intranet \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=http://10.0.0.3:8100 \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://myicr.investmentclubregensburg.com \
#     --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=… .
#
# NEXT_PUBLIC_* setzt Next.js beim Build fest in den Code ein, sie müssen also als Build-Argument kommen.
# Geheimnisse (SUPABASE_SERVICE_ROLE_KEY, MEMBER_DATA_MASTER_KEY …) NIE als Build-Argument übergeben,
# sie stünden sonst in der Image-Historie. Sie kommen nur zur Laufzeit als Umgebungsvariablen.

# Node 22 wie in der CI (.github/workflows/ci.yml), feste Version für reproduzierbare Builds.
ARG NODE_IMAGE=node:22.23.5-alpine3.24

# --- Abhängigkeiten ----------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Gleiche npm-Version wie in der CI; ältere Versionen lösen die Lockdatei anders auf.
RUN npm install -g npm@12.0.1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- Build -------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
# ICR_HOSTING=self: Produktions-Build auf dem eigenen Server (Produktionssperre in next.config.ts).
ENV NEXT_TELEMETRY_DISABLED=1 \
    ICR_HOSTING=self
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Laufzeit ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Eigenständiger Server aus output: "standalone" (next.config.ts); statische Dateien liegen daneben.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Nicht als root (Benutzer node aus dem offiziellen Image).
USER node
EXPOSE 3000
# Leichte Route ohne Datenbank (app/api/health/route.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
