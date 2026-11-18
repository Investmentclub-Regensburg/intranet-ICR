import {
  EVENT_IMAGE_BUCKET,
  EVENT_IMAGE_CONTENT_TYPES,
  EVENT_IMAGE_PATH_RE,
} from "@/lib/events";

/**
 * Event-Bilder (Flyer) über die App ausliefern: GET /bilder/event-images/<pfad>.
 *
 * Öffentlich wie bisher (der Bucket event-images ist öffentlich, die Bilder stehen auch in Event-Mails).
 * Die App holt die Datei serverseitig über die öffentliche Storage-Adresse und reicht sie durch; der Browser
 * spricht nie mit Supabase. Supabase muss dafür von außen nicht erreichbar sein (eigener Server: nur
 * privates Netz).
 *
 * Nur Bucket event-images, nur Pfade im erwarteten Muster (lib/events.ts, EVENT_IMAGE_PATH_RE), kein "..".
 * Pfade enthalten UUIDs bzw. Zeitstempel und ändern sich nie → lange, unveränderliche Zwischenspeicherung.
 */

const UPSTREAM_TIMEOUT_MS = 10_000;

function notFound() {
  return new Response("Nicht gefunden.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ pfad: string[] }> }) {
  const { pfad } = await params;
  const path = (pfad ?? []).join("/");
  if (!EVENT_IMAGE_PATH_RE.test(path)) return notFound();
  const ext = path.slice(path.lastIndexOf(".") + 1);
  const contentType = EVENT_IMAGE_CONTENT_TYPES[ext];

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base || !contentType) return notFound();

  const ifNoneMatch = request.headers.get("if-none-match");
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/storage/v1/object/public/${EVENT_IMAGE_BUCKET}/${path}`, {
      headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("event-image GET:", err instanceof Error ? err.message : err);
    return new Response("Bild gerade nicht verfügbar.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const headers = new Headers({
    // Typ aus der geprüften Endung, nicht aus der Antwort des Speichers.
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  });
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("ETag", etag);
  const lastModified = upstream.headers.get("last-modified");
  if (lastModified) headers.set("Last-Modified", lastModified);

  if (upstream.status === 304) return new Response(null, { status: 304, headers });
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel();
    if (upstream.status >= 500) {
      console.error("event-image GET: Storage antwortet", upstream.status);
      return new Response("Bild gerade nicht verfügbar.", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    // Supabase antwortet bei fehlenden Objekten mit 400 bzw. 404.
    return notFound();
  }

  // fetch entpackt komprimierte Antworten; die Länge stimmt dann nicht mehr.
  const length = upstream.headers.get("content-length");
  if (length && !upstream.headers.get("content-encoding")) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
