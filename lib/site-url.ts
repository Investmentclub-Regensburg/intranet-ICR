/**
 * Basis-URL des Intranets für Links in E-Mails (z. B. Passwort-Reset).
 *
 * In Produktion fest über NEXT_PUBLIC_SITE_URL (z. B. https://myicr.investmentclubregensburg.com),
 * damit Links nicht vom Origin-Header einer Anfrage abhängen. Ohne Konfiguration
 * (lokal, Preview) wird der Origin-Header genutzt, sofern es eine http(s)-Origin ist.
 */
export function getSiteOrigin(requestOrigin: string | null | undefined): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // ungültige Konfiguration → Fallback unten
    }
  }
  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // ignorieren
    }
  }
  return "http://localhost:3000";
}
