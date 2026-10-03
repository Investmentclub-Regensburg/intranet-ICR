/**
 * Nur relative Pfade innerhalb des Intranets als Redirect-Ziel zulassen
 * (verhindert Open Redirects wie `?next=//evil.example` oder `?next=https://…`).
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.startsWith("/login") || path.startsWith("/auth/")) return null;
  return path;
}
