import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Supabase-Origin (REST, Auth, Storage-Bilder, Realtime) für die CSP.
let supabaseOrigin = "";
try {
  supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
} catch {
  supabaseOrigin = "";
}
const supabaseRealtime = supabaseOrigin.replace(/^https:/, "wss:");
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
  `img-src 'self' data: blob: ${supabaseOrigin} ${VERCEL_LIVE}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseRealtime} ${TURNSTILE} ${VERCEL_LIVE}`,
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
    ];
  },
};

export default nextConfig;
