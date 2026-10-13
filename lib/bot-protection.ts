import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/utils/supabase/service";

/**
 * Bot-Schutz für Registrierung, Login und Passwort-vergessen.
 *
 * Turnstile: Ist in Supabase Auth (Attack Protection) CAPTCHA mit Turnstile aktiv
 * (SUPABASE_AUTH_CAPTCHA=true), prüft Supabase das Token selbst – auch bei Aufrufen, die die App
 * umgehen. Dann wird es nur als captchaToken durchgereicht (Tokens sind einmalig gültig).
 * Sonst prüft die App das Token bei Cloudflare.
 *
 * Rate-Limit: Zähler je Hash von IP bzw. E-Mail in public.auth_rate_limits (Migration
 * 20261009140000). Die Supabase-Limits greifen hier nicht sinnvoll, weil alle Aufrufe von den
 * Vercel-Servern kommen.
 */

export const TURNSTILE_FIELD = "cf-turnstile-response";
const DEV_BYPASS_TOKEN = "localhost-bypass";

export type CaptchaCheck =
  | { ok: true; /** Für supabase.auth.*({ options: { captchaToken } }), sonst undefined. */ captchaToken?: string }
  | { ok: false; error: string };

export async function checkTurnstile(formData: FormData): Promise<CaptchaCheck> {
  const raw = formData.get(TURNSTILE_FIELD);
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!token) {
    return { ok: false, error: "Bot-Schutz fehlgeschlagen. Bitte bestätige, dass du kein Bot bist." };
  }
  if (token === DEV_BYPASS_TOKEN && process.env.NODE_ENV === "development") return { ok: true };
  if (token.length > 2048) return { ok: false, error: "Bot-Schutz fehlgeschlagen. Bitte versuche es erneut." };

  if (process.env.SUPABASE_AUTH_CAPTCHA === "true") return { ok: true, captchaToken: token };

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("checkTurnstile: TURNSTILE_SECRET_KEY fehlt");
    return { ok: false, error: "Der Bot-Schutz ist gerade nicht verfügbar. Bitte kontaktiere den Vorstand." };
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: await clientIp() }),
      cache: "no-store",
    });
    const data = (await res.json()) as { success?: boolean };
    if (!res.ok || !data.success) {
      return { ok: false, error: "Bot-Schutz fehlgeschlagen. Bitte versuche es erneut." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Bot-Schutz konnte nicht geprüft werden. Bitte versuche es später erneut." };
  }
}

/** IP der anfragenden Person (auf Vercel setzt die Plattform x-forwarded-for selbst). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

function hashKey(scope: string, value: string): string {
  return `${scope}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 40)}`;
}

export type RateRule = { scope: string; value: string; max: number; windowSeconds: number };

/**
 * true = erlaubt. Zählt jeden Aufruf. Fehlt die Tabelle oder ist die Datenbank nicht erreichbar,
 * wird nicht blockiert (Login soll nicht am Zähler scheitern); der Fehler landet im Log.
 */
export async function withinRateLimits(rules: RateRule[]): Promise<boolean> {
  const admin = createServiceClient();
  const results = await Promise.all(
    rules.map(async (rule) => {
      const { data, error } = await admin.rpc("rate_limit_hit", {
        p_key: hashKey(rule.scope, rule.value),
        p_max: rule.max,
        p_window_seconds: rule.windowSeconds,
      });
      if (error) {
        console.error("withinRateLimits:", error.code ?? error.message);
        return true;
      }
      return data !== false;
    })
  );
  return results.every(Boolean);
}

export const RATE_LIMITED_MESSAGE =
  "Zu viele Versuche. Bitte warte ein paar Minuten und versuche es dann erneut.";
