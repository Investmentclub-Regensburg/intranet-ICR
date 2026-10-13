/**
 * Prüfung von Weiterleitungszielen (z. B. `?next=` nach dem Login).
 *
 * Zugelassen sind nur relative Pfade innerhalb des Intranets:
 * - beginnt mit genau einem `/` (kein `//`, kein Protokoll, keine Domain)
 * - keine Backslashes, keine Steuerzeichen (inkl. Tab/Zeilenumbruch)
 * - dieselben Regeln gelten nach jeder URL-Dekodierung erneut
 * - das Ergebnis muss beim Auflösen auf derselben Origin bleiben
 * - keine Ziele, die wieder auf Login-/Auth-Seiten führen
 *
 * Alles andere wird verworfen (`null`); Aufrufer setzen dann einen festen Fallback.
 */

const MAX_LENGTH = 1024;
const MAX_DECODE_ROUNDS = 3;
const CHECK_ORIGIN = "https://intranet.invalid";

/** Ziele, die nicht als Weiterleitung nach dem Login taugen (Schleifen, Auth-Flows). */
const BLOCKED_PATHS = ["/login", "/register", "/forgot-password", "/auth"];

/** Standardziel, wenn kein gültiges Weiterleitungsziel vorliegt. */
export const DEFAULT_REDIRECT_PATH = "/dashboard";

// Steuerzeichen (C0, DEL, C1) und Backslash.
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F\\]/;

function isPlainRelativePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (FORBIDDEN_CHARS.test(value)) return false;
  return true;
}

function isBlocked(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLOCKED_PATHS.some((p) => lower === p || lower.startsWith(`${p}/`));
}

/**
 * Liefert einen sicheren, relativen Pfad (inkl. Query/Hash) oder `null`.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_LENGTH) return null;

  // Rohwert und jede Dekodierungsstufe prüfen (z. B. %2F%2F, %5C, %09).
  let current = value;
  for (let round = 0; round <= MAX_DECODE_ROUNDS; round++) {
    if (!isPlainRelativePath(current)) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) break;
    if (round === MAX_DECODE_ROUNDS) return null; // zu tief verschachtelt kodiert
    current = decoded;
  }

  let url: URL;
  try {
    url = new URL(value, CHECK_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== CHECK_ORIGIN) return null;
  if (isBlocked(url.pathname)) return null;

  const result = `${url.pathname}${url.search}${url.hash}`;
  // Ergebnis nach der Normalisierung noch einmal prüfen.
  if (!isPlainRelativePath(result)) return null;
  return result;
}

/**
 * Wie `safeNextPath`, aber immer mit Fallback.
 */
export function safeRedirectPath(value: unknown, fallback: string = DEFAULT_REDIRECT_PATH): string {
  return safeNextPath(value) ?? fallback;
}
