/**
 * Kleine Eingabeprüfungen für Server Actions (IDs aus dem Browser sind nie vertrauenswürdig).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_ID_RE = /^[1-9]\d{0,18}$/;

/** UUID (z. B. profiles.id, alumni_requests.id, bvh_login_requests.id). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** UUID oder positive Ganzzahl – für Tabellen, deren ID-Typ hier nicht festgelegt ist (events, news). */
export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && (UUID_RE.test(value) || INT_ID_RE.test(value));
}
