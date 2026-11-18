import { NextResponse, type NextRequest } from "next/server";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireRole } from "@/utils/supabase/guards";
import {
  EVENT_IMAGE_BUCKET,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_TYPES,
  detectEventImageType,
} from "@/lib/events";

/**
 * Upload eines Event-Bilds (Anlegen/Bearbeiten im Event-Formular). Ersetzt den früheren Upload direkt aus dem
 * Browser in den Bucket: Der Browser spricht nie mit Supabase, die App lädt hoch.
 *
 * Route Handler statt Server Action, weil Server Actions nur 1 MB Body annehmen (Bilder bis 5 MB).
 * Antwort: `{ path }` (Pfad im Bucket `<userId>/<uuid>.<ext>`) oder `{ error }`.
 *
 * Hochgeladen wird mit dem Client der angemeldeten Person (nicht mit der Service Role): Die Storage-Regel
 * „Admins dürfen Bilder hochladen“ (is_admin_or_board) greift damit zusätzlich zur Rollenprüfung hier.
 */

/** Spielraum für die Multipart-Hülle (Trenner, Feldnamen) über der eigentlichen Datei. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Nur Anfragen von der eigenen Seite (zusätzlich zu den SameSite-Cookies). */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail("Ungültige Anfrage.", 403);

  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) {
    const loggedOut = auth.error === "Nicht eingeloggt.";
    return fail(loggedOut ? "Sitzung abgelaufen. Bitte neu anmelden." : auth.error, loggedOut ? 401 : 403);
  }

  // Zu große Anfragen gar nicht erst einlesen.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > EVENT_IMAGE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) return fail("Bild darf maximal 5 MB groß sein.", 413);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return fail("Bild konnte nicht hochgeladen werden.", 400);
  }
  if (!(file instanceof File) || file.size === 0) return fail("Keine Datei ausgewählt.", 400);
  if (!EVENT_IMAGE_TYPES[file.type]) return fail("Nur Bilder (JPG, PNG, GIF, WebP) erlaubt.", 415);
  if (file.size > EVENT_IMAGE_MAX_BYTES) return fail("Bild darf maximal 5 MB groß sein.", 413);

  // Inhalt prüfen: Maßgeblich ist der tatsächliche Dateiinhalt, nicht die Angabe des Browsers. Endung und
  // Content-Type entstehen nur aus dem erkannten Typ. Ein PNG mit Endung .jpg (häufig bei Downloads) bleibt
  // damit erlaubt und wird als PNG gespeichert; alles, was kein Bild der vier Typen ist, fällt durch.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectEventImageType(bytes);
  if (!detected || !EVENT_IMAGE_TYPES[detected]) return fail("Nur Bilder (JPG, PNG, GIF, WebP) erlaubt.", 415);

  const path = `${auth.user.id}/${crypto.randomUUID()}.${EVENT_IMAGE_TYPES[detected]}`;
  const supabase = await getCachedSupabase();
  const { error } = await supabase.storage
    .from(EVENT_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: detected, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("event-image upload:", error.message);
    return fail("Bild konnte nicht hochgeladen werden.", 500);
  }
  return NextResponse.json({ path }, { headers: { "Cache-Control": "no-store" } });
}
