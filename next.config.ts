import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Supabase-Origin für die Produktionssperre unten. Nicht mehr in der CSP: Der Browser spricht nie direkt
// mit Supabase (Abmelden, Bild-Upload und Event-Bilder laufen über die App).
let supabaseOrigin = "";
try {
  supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
} catch {
  supabaseOrigin = "";
}

// Lokal (next dev, lokaler Build) nie gegen die Produktions-Datenbank: .env.local zeigt auf das
// Test-Projekt Intranet-Test. Nur der Produktions-Build nutzt die Produktion: auf Vercel (Branch prod,
// erkennbar an VERCEL) oder auf dem eigenen Server (Dockerfile setzt ICR_HOSTING=self beim Build, README.md).
// Schutz vor Versehen, keine Sicherheitsgrenze (VERCEL=1 oder ICR_HOSTING=self umgehen ihn).
const isProductionHost = Boolean(process.env.VERCEL) || process.env.ICR_HOSTING === "self";

// Eigener Server: Weiterleitungen nach Mail-Links und Login bauen auf NEXT_PUBLIC_SITE_URL (lib/site-url.ts),
// weil request.url im Container die interne Adresse enthält. Der Wert wird beim Build fest eingesetzt – ohne ihn
// (oder mit der Adresse einer anderen Umgebung) landen Nutzer nach dem Klick auf den Link ohne Sitzung auf einer
// fremden Adresse. Deshalb: jede Umgebung (Probe, Produktion) bekommt ihren eigenen Build mit ihrer Adresse.
if (process.env.ICR_HOSTING === "self" && !process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
  throw new Error("NEXT_PUBLIC_SITE_URL fehlt: Auf dem eigenen Server muss die Adresse beim Build gesetzt sein (README.md).");
}
const PROD_SUPABASE_REF = "vxcwtfktnefreboejgpw";
function jwtRef(token: string | undefined): string {
  try {
    const payload = token?.split(".")[1];
    return payload ? String(JSON.parse(Buffer.from(payload, "base64url").toString()).ref ?? "") : "";
  } catch {
    return "";
  }
}
// Eigener Server: Die Produktion hängt am privaten Gateway auf Port 8100 (direkt oder über einen SSH-Tunnel,
// README.md). Die Keys dort tragen keine Projekt-Ref, deshalb wird die Adresse geprüft. Lokales Supabase
// (supabase start) nutzt 54321 und ist nicht betroffen.
const PROD_SELF_HOSTED_PORT = "8100";
let supabasePort = "";
try {
  supabasePort = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").port;
} catch {
  supabasePort = "";
}
if (
  !isProductionHost &&
  (supabaseOrigin.includes(PROD_SUPABASE_REF) ||
    supabasePort === PROD_SELF_HOSTED_PORT ||
    jwtRef(process.env.SUPABASE_SERVICE_ROLE_KEY) === PROD_SUPABASE_REF)
) {
  throw new Error(
    "Supabase-Zugangsdaten (URL oder Service-Role-Key) zeigen auf die Produktion. Lokal bitte die Zugangsdaten " +
      "des Test-Projekts (Intranet-Test) in .env.local eintragen.",
  );
}
const TURNSTILE = "https://challenges.cloudflare.com";

// Vercel-Toolbar (Kommentare/Feedback) läuft nur auf Preview-Deployments, z. B. dev.
const VERCEL_LIVE = process.env.VERCEL_ENV === "preview" ? "https://vercel.live" : "";

/**
 * Content-Security-Policy (erzwungen): Der Browser lädt Skripte, Bilder, Schriften und
 * Verbindungen nur von hier aufgeführten Quellen. Neue externe Dienste (CDN, Analyse, Einbettungen)
 * müssen hier ergänzt werden, sonst blockiert der Browser sie.
 * 'unsafe-inline' bei script-src ist nötig, solange Next.js ohne Nonces läuft.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE} ${VERCEL_LIVE}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${VERCEL_LIVE}`,
  "font-src 'self' data:",
  `connect-src 'self' ${TURNSTILE} ${VERCEL_LIVE}`,
  `frame-src ${TURNSTILE} ${VERCEL_LIVE}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
]
  .map((directive) => directive.replace(/\s+/g, " ").trim())
  .join("; ");

/**
 * Sicherheits-Header für alle Routen.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Clickjacking-Schutz für ältere Browser (zusätzlich zu frame-ancestors).
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-Sniffing unterbinden.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer nur minimal weitergeben.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Sensible Browser-APIs standardmäßig deaktivieren.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Fenster-Isolation gegenüber fremden Seiten (z. B. über window.opener).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // HTTPS erzwingen (2 Jahre inkl. Subdomains).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Eigenständiger Server (.next/standalone) für das Docker-Image auf dem eigenen Server (Dockerfile).
  // Auf Vercel bewusst nicht gesetzt: Dort bleibt der Build bis zum Umzug genau wie bisher.
  output: process.env.VERCEL ? undefined : "standalone",
  // Nur Vorschau (feat/vorschau): Dev-Server auch über das Tailnet nutzbar (Handy/zweiter PC),
  // sonst lädt Next.js im Dev-Modus das JavaScript für fremde Hosts nicht und Knöpfe reagieren nicht.
  allowedDevOrigins: ["100.78.25.9", "*.tail74a8aa.ts.net"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Event-Bilder: strengere CSP als zweite Sicherung (nichts ausführen, nichts nachladen). Muss hier stehen,
      // nicht nur im Route Handler: Next setzt die Header aus next.config vorher, ein später gesetzter
      // Content-Security-Policy-Header der Route würde nicht greifen. Der spätere Eintrag überschreibt den obigen.
      // Die Anzeige als <img> auf den Seiten betrifft das nicht (dort gilt die CSP der Seite).
      {
        source: "/bilder/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }],
      },
    ];
  },
};

export default nextConfig;
