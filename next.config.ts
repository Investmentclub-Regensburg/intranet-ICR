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

/**
 * Vollständige Content-Security-Policy – vorerst nur als Report-Only:
 * Verstöße erscheinen in der Browser-Konsole, blockiert wird nichts.
 * Nach Prüfung im Browser (Login, Registrierung mit Turnstile, Event-Bilder,
 * Uploads, Admin-Exporte) kann sie als "Content-Security-Policy" erzwungen werden.
 * 'unsafe-inline' bei script-src ist nötig, solange Next.js ohne Nonces läuft.
 */
const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseRealtime} ${TURNSTILE}`.replace(/\s+/g, " ").trim(),
  `frame-src ${TURNSTILE}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * Erzwungener Teil der CSP: nur Direktiven, die keine bestehende Funktion betreffen
 * (keine Einbettung in fremde Seiten, kein <base>-Umbiegen, keine Plugins).
 */
const cspEnforced = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");

/**
 * Sicherheits-Header für alle Routen.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: cspEnforced },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
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
