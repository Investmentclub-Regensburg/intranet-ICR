// Edge Function "notify-board"
//
// Wird vom DB-Trigger public.dispatch_notification_event() per pg_net aufgerufen,
// sobald eine Zeile in public.notification_events landet. Lädt das Event mit der
// Service Role, verschickt eine E-Mail an den Vorstandsverteiler über Resend und
// schreibt sent_at bzw. last_error zurück.
//
// Aufruf ohne event_id (z. B. manuell per curl) arbeitet bis zu 20 offene Events ab
// (Retry für Events, deren Versand fehlgeschlagen ist).
// Aufruf mit { "action": "health" } zeigt, welche Secrets gesetzt sind (nur Namen/Längen, keine Werte).
// Events vom Typ alumni_decided gehen an das Mitglied (Adresse aus dem Profil zu payload.user_id),
// alle anderen an den Vorstand.
// Events vom Typ event_announcement (neues Event) gehen an payload.recipients – einzeln adressiert,
// in Resend-Batches à 100. Der Fortschritt steht in payload.sent_count, ein Retry setzt dort fort.
// Events vom Typ task_deadline (Aufgaben-Board, täglich per pg_cron, ein Event je zuständiger
// Person) gehen an diese Person (Adresse aus dem Profil zu payload.assignee_profile_id), Reply-To Vorstand.
// Events vom Typ task_assigned (Aufgabe neu zugeteilt, von den Server Actions des Aufgaben-Boards)
// gehen ebenso an payload.assignee_profile_id; Reply-To ist die Person, die zugeteilt hat.
// Events vom Typ iban_changed gehen an den Vorstand (nur die letzten 4 Stellen der IBAN).
//
// Secrets (Dashboard → Edge Functions → Secrets oder `supabase secrets set`):
//   NOTIFY_BOARD_SECRET  – muss dem Vault-Secret notify_board_secret entsprechen
//   RESEND_API_KEY       – Resend API-Key
//   NOTIFY_TO_EMAIL      – Empfänger, kommasepariert (Default: info@investmentclubregensburg.com)
//   NOTIFY_CANCELLATION_EMAIL – Empfänger der Kündigungsmails und Antwortadresse der Kündigungsbestätigung,
//                          kommasepariert (Default: kuendigung@investmentclubregensburg.com)
//   NOTIFY_FROM_EMAIL    – Absender, Domain muss in Resend verifiziert sein
//   INTRANET_URL         – optional, Basis-URL für Links in die Admin-Seiten (Default: https://myicr.investmentclubregensburg.com)
//
// Deploy: verify_jwt = false (Auth läuft über den Shared-Secret-Header x-notify-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type EventType =
  | "member_registered"
  | "member_cancelled"
  | "member_cancellation_confirmed"
  | "alumni_requested"
  | "alumni_decided"
  | "event_announcement"
  | "task_deadline"
  | "task_assigned"
  | "iban_changed"
  | "test";

type NotificationEvent = {
  id: string;
  type: EventType;
  profile_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
  attempts: number;
  last_error: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_BOARD_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TO_EMAILS = (Deno.env.get("NOTIFY_TO_EMAIL") ?? "info@investmentclubregensburg.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Kündigungen gehen an die Gruppe „Kündigung“ statt an die allgemeine Vorstandsadresse.
const CANCELLATION_EMAILS = (Deno.env.get("NOTIFY_CANCELLATION_EMAIL") ?? "kuendigung@investmentclubregensburg.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FROM_EMAIL =
  Deno.env.get("NOTIFY_FROM_EMAIL") ?? "ICR Intranet <intranet@myicr.investmentclubregensburg.com>";
const INTRANET_URL = (Deno.env.get("INTRANET_URL") ?? "https://myicr.investmentclubregensburg.com").replace(
  /\/+$/,
  ""
);

const MAX_BATCH = 20;
// Obergrenzen für Rundmails (Schutz gegen Missbrauch als Mail-Relay).
const MAX_ANNOUNCEMENT_RECIPIENTS = 5000;
const MAX_CUSTOM_RECIPIENTS = 50;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Resend: max. 100 Mails pro Batch-Request, Default-Rate-Limit 2 Requests/Sekunde.
const RESEND_BATCH_SIZE = 100;
const RESEND_BATCH_PAUSE_MS = 600;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function escapeHtml(v: unknown): string {
  return str(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Betreffzeile: keine Zeilenumbrüche/Steuerzeichen, begrenzte Länge. */
function cleanSubject(v: string): string {
  return v.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 200);
}

/** Shared Secret zeitkonstant vergleichen (SHA-256 beider Werte, dann XOR über feste Länge). */
async function secretMatches(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function formatDate(v: unknown): string {
  const s = str(v);
  if (!s) return "–";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

function formatDateTime(v: unknown): string {
  const s = str(v);
  if (!s) return "–";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

function fullName(p: Record<string, unknown>): string {
  const name = [str(p.vorname), str(p.nachname)].filter(Boolean).join(" ");
  return name || "Unbekannt";
}

type Mail = { subject: string; html: string; text: string; to: string[]; replyTo?: string };

function renderRows(rows: Array<[string, string]>): { html: string; text: string } {
  const html = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;vertical-align:top">${escapeHtml(v) || "–"}</td></tr>`
    )
    .join("");
  const text = rows.map(([k, v]) => `${k}: ${v || "–"}`).join("\n");
  return { html, text };
}

/** Anrede: „Hallo Anna,“ bzw. „Hallo,“ ohne Vornamen. */
function greeting(vorname: string): string {
  return vorname ? `Hallo ${vorname},` : "Hallo,";
}

const DEFAULT_FOOTER =
  "Automatische Benachrichtigung aus dem ICR Intranet. Antworten auf diese E-Mail werden nicht gelesen.";

function wrapHtml(
  title: string,
  intro: string,
  rowsHtml: string,
  link?: { href: string; label: string },
  opts: { footer?: string; headerHtml?: string; afterRowsHtml?: string } = {}
): string {
  const linkHtml = link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px">${escapeHtml(link.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="de"><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280">ICR Intranet</p>
    ${opts.headerHtml ?? ""}
    <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5">${escapeHtml(intro)}</p>
    <table style="border-collapse:collapse;font-size:14px;width:100%">${rowsHtml}</table>
    ${opts.afterRowsHtml ?? ""}
    ${linkHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">${escapeHtml(opts.footer ?? DEFAULT_FOOTER)}</p>
  </div>
</body></html>`;
}

function adminLink(path: string, label: string): { href: string; label: string } | undefined {
  if (!INTRANET_URL) return undefined;
  return { href: `${INTRANET_URL}${path}`, label };
}

// Datum/Uhrzeit der Events sind Berliner Wanduhrzeit ohne Zeitzone → ohne Date-Umrechnung formatieren.
function formatEventDate(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
  if (!m) return str(v) || "–";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Mehrtägig (multiDay): Beginn gilt für den ersten, Ende für den letzten Tag – kein „Folgetag“.
function formatTimeRange(start: unknown, end: unknown, multiDay = false): string {
  const s = str(start).slice(0, 5);
  const e = str(end).slice(0, 5);
  if (!s) return "";
  if (multiDay) return e ? `Beginn ${s} Uhr · Ende ${e} Uhr` : `Beginn ${s} Uhr`;
  if (!e) return `${s} Uhr`;
  return `${s} – ${e} Uhr${e <= s ? " (Folgetag)" : ""}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()} …` : text;
}

function buildEventAnnouncement(ev: NotificationEvent): Omit<Mail, "to"> {
  const e = (ev.payload?.event ?? {}) as Record<string, unknown>;
  const eventId = str(ev.payload?.event_id) || str(e.id);
  const title = str(e.title) || "Neues Event";
  const multiDay = !!str(e.end_date) && str(e.end_date) > str(e.event_date);
  const dates = multiDay ? `${formatEventDate(e.event_date)} bis ${formatEventDate(e.end_date)}` : formatEventDate(e.event_date);
  const when = [dates, formatTimeRange(e.event_time, e.end_time, multiDay)].filter(Boolean).join(", ");
  const description = truncate(str(e.description), 600);
  const imageUrl = str(e.image_url);
  const needsRegistration = Boolean(e.requires_registration);

  const rows: Array<[string, string]> = [["Wann", when]];
  if (str(e.location)) rows.push(["Wo", str(e.location)]);
  if (str(e.organizer)) rows.push(["Veranstalter", str(e.organizer)]);
  if (needsRegistration) rows.push(["Anmeldung", "Erforderlich – bitte im Intranet anmelden"]);
  const r = renderRows(rows);

  const intro = "Im ICR Intranet gibt es ein neues Event:";
  // Nur Bilder aus dem eigenen Supabase-Storage einbetten.
  const headerHtml =
    imageUrl && SUPABASE_URL && imageUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`)
      ? `<img src="${escapeHtml(imageUrl)}" alt="" style="display:block;width:100%;max-height:280px;object-fit:cover;border-radius:8px;margin:0 0 16px" />`
      : "";
  const afterRowsHtml = description
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#374151">${escapeHtml(description).replace(/\n/g, "<br />")}</p>`
    : "";
  const link = adminLink(`/events/${encodeURIComponent(eventId)}`, needsRegistration ? "Zum Event & anmelden" : "Event im Intranet ansehen");
  const footer = "Du erhältst diese E-Mail als Mitglied des Investmentclub Regensburg. Bei Fragen antworte einfach auf diese Mail.";

  return {
    subject: `Neues Event: ${title}`,
    html: wrapHtml(title, intro, r.html, link, { footer, headerHtml, afterRowsHtml }),
    text: [
      title,
      "",
      intro,
      "",
      r.text,
      description ? `\n${description}` : "",
      link ? `\n${link.label}: ${link.href}` : "",
      "",
      footer,
    ].join("\n"),
    replyTo: TO_EMAILS[0],
  };
}

type MemberRecipient = { email: string; vorname: string };

/**
 * Empfänger für Mails an ein Mitglied (alumni_decided, member_cancellation_confirmed): ausschließlich aus dem Profil bzw.
 * Auth-Konto zu payload.user_id – nie aus frei befüllbaren Feldern des Ereignisses.
 */
async function resolveMemberRecipient(
  supabase: ReturnType<typeof createClient>,
  ev: NotificationEvent
): Promise<MemberRecipient | null> {
  const userId = str(ev.payload?.user_id);
  if (!UUID_RE.test(userId)) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select('"E-Mail", "Vorname"')
    .eq("user_id", userId)
    .maybeSingle();
  const p = (profile ?? {}) as Record<string, unknown>;
  const profileEmail = str(p["E-Mail"]).toLowerCase();
  if (EMAIL_RE.test(profileEmail)) return { email: profileEmail, vorname: str(p["Vorname"]) };

  const { data } = await supabase.auth.admin.getUserById(userId);
  const authEmail = str(data?.user?.email).toLowerCase();
  if (EMAIL_RE.test(authEmail)) return { email: authEmail, vorname: str(p["Vorname"]) };
  return null;
}

/**
 * Empfänger für Aufgaben-Erinnerungen: Profil zu payload.assignee_profile_id (profiles.id),
 * nur Vorstand/Admin und nicht gekündigt.
 */
async function resolveAssigneeRecipient(
  supabase: ReturnType<typeof createClient>,
  ev: NotificationEvent,
  field = "assignee_profile_id"
): Promise<MemberRecipient | null> {
  const profileId = str(ev.payload?.[field]);
  if (!UUID_RE.test(profileId)) return null;
  const { data } = await supabase
    .from("profiles")
    .select('"E-Mail", "Vorname", "Rolle", "Status"')
    .eq("id", profileId)
    .maybeSingle();
  const p = (data ?? {}) as Record<string, unknown>;
  const role = str(p["Rolle"]).toLowerCase();
  if (role !== "board" && role !== "admin") return null;
  if (str(p["Status"]).toLowerCase() === "cancelled") return null;
  const email = str(p["E-Mail"]).toLowerCase();
  return EMAIL_RE.test(email) ? { email, vorname: str(p["Vorname"]) } : null;
}

// Gleiche Schlüssel wie lib/cancellation-reasons.ts (App) und die Datenbank-Prüfung.
const CANCELLATION_REASONS: Record<string, string> = {
  studium_beendet: "Studium beendet / Wegzug",
  keine_zeit: "Keine Zeit mehr",
  zu_wenig_inhalte: "Zu wenig Inhalte / Angebote",
  inhalte_passen_nicht: "Inhalte/Events passen nicht zu mir",
  beitrag: "Mitgliedsbeitrag",
  anderes_angebot: "Wechsel zu anderem Verein/Angebot",
  sonstiges: "Sonstiges",
};

const PRIORITY_LABELS: Record<string, string> = { low: "Niedrig", normal: "Normal", high: "Hoch" };
const STATUS_LABELS: Record<string, string> = { planned: "Geplant", in_progress: "In Arbeit", done: "Erledigt" };

function buildMail(
  ev: NotificationEvent,
  extra: { emailConfirmed?: boolean | null; recipient?: MemberRecipient | null; replyTo?: string | null }
): Mail {
  const p = ev.payload ?? {};
  const name = fullName(p);

  switch (ev.type) {
    case "member_registered": {
      const confirmed =
        extra.emailConfirmed === null || extra.emailConfirmed === undefined
          ? "unbekannt"
          : extra.emailConfirmed
            ? "ja"
            : "nein (noch nicht bestätigt)";
      const rows: Array<[string, string]> = [
        ["Name", name],
        ["E-Mail", str(p.email)],
        ["E-Mail bestätigt", confirmed],
        ["Studiengang", str(p.studiengang)],
        ["Abschluss", str(p.abschluss)],
        ["Semester", str(p.semester)],
        ["Hochschulart", str(p.hochschulart)],
        ["Antragsdatum", formatDate(p.datum_antrag)],
        ["Zeitpunkt", formatDateTime(ev.created_at)],
      ];
      const r = renderRows(rows);
      const title = `Neue Registrierung: ${name}`;
      const intro = "Ein neues Mitglied hat sich im Intranet registriert.";
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, adminLink("/admin/members", "Mitglieder öffnen")),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: TO_EMAILS,
      };
    }
    case "member_cancelled": {
      const rows: Array<[string, string]> = [
        ["Name", name],
        ["E-Mail", str(p.email)],
        ["Mitgliedsnummer", str(p.mitgliedsnummer)],
        ["Rolle", str(p.rolle)],
        ["Studiengang", str(p.studiengang)],
        ["Mitglied seit", formatDate(p.datum_antrag)],
        ["Kündigungsdatum", formatDate(p.datum_kuendigung)],
        [
          "Grund",
          p.self_service === false
            ? "– (Kündigung durch den Vorstand im Intranet)"
            : (CANCELLATION_REASONS[str(p.reason)] ?? (str(p.reason) || "nicht angegeben")),
        ],
        ["Anmerkung", str(p.reason_text)],
        ["Zeitpunkt", formatDateTime(ev.created_at)],
      ];
      const r = renderRows(rows);
      const title = `Kündigung: ${name}`;
      const intro =
        "Eine Mitgliedschaft wurde gekündigt (Status auf „cancelled“ gesetzt). Bitte SEPA-Mandat und Verteiler prüfen.";
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, adminLink("/admin/members", "Mitglieder öffnen")),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: CANCELLATION_EMAILS,
      };
    }
    case "member_cancellation_confirmed": {
      const vorname = str(extra.recipient?.vorname);
      // Empfänger nur aus dem Profil des kündigenden Kontos (siehe resolveMemberRecipient).
      const recipient = extra.recipient?.email ?? "";
      const title = "Deine Kündigung beim ICR ist eingegangen";
      const feeSemester = str(p.fee_semester);
      const feeLine = feeSemester
        ? ` Ab dem ${feeSemester} wird kein Mitgliedsbeitrag mehr eingezogen.`
        : "";
      const intro =
        `${greeting(vorname)} wir bestätigen dir hiermit die Kündigung deiner Mitgliedschaft im Investmentclub Regensburg.${feeLine} ` +
        "Dein Zugang zum Intranet ist damit beendet. Schade, dass du gehst – danke für deine Zeit im ICR und alles Gute für deinen weiteren Weg! " +
        (p.reason_given === false
          ? "Magst du uns noch sagen, warum du gehst? Antworte einfach auf diese Mail – das hilft uns, den ICR besser zu machen. "
          : "") +
        "War die Kündigung ein Versehen oder hast du Fragen, antworte ebenfalls einfach auf diese Mail.";
      const rows: Array<[string, string]> = [
        ["Eingegangen am", formatDate(p.datum_kuendigung)],
        ["Kein Beitrag mehr ab", feeSemester ? `${feeSemester} (Stichtag ${str(p.fee_stichtag)})` : "– (bisher beitragsfrei)"],
        ["Rückfragen", CANCELLATION_EMAILS[0] ?? ""],
      ];
      const r = renderRows(rows);
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, undefined, {
          footer: "Automatische Nachricht aus dem ICR Intranet. Antworten auf diese E-Mail gehen an den Vorstand.",
        }),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: recipient ? [recipient] : [],
        replyTo: CANCELLATION_EMAILS[0],
      };
    }
    case "alumni_requested": {
      const rows: Array<[string, string]> = [
        ["Name", name],
        ["E-Mail", str(p.email)],
        ["Aktuelle Rolle", str(p.rolle)],
        ["Studiengang", str(p.studiengang)],
        ["Mitglied seit", formatDate(p.datum_antrag)],
        ["Zeitpunkt", formatDateTime(ev.created_at)],
      ];
      const r = renderRows(rows);
      const title = `Alumni-Antrag: ${name}`;
      const intro =
        "Ein Mitglied hat im Profil den Alumni-Status beantragt. Freigabe oder Ablehnung im Admin-Bereich.";
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, adminLink("/admin/alumni-requests", "Alumni-Anträge öffnen")),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: TO_EMAILS,
      };
    }
    case "alumni_decided": {
      const vorname = str(extra.recipient?.vorname);
      const approved = str(p.decision) === "approved";
      // Empfänger nur aus dem Profil des antragstellenden Kontos (siehe resolveMemberRecipient).
      const recipient = extra.recipient?.email ?? "";
      const title = approved
        ? "Dein Alumni-Status wurde freigeschaltet"
        : "Dein Alumni-Antrag wurde abgelehnt";
      const intro = approved
        ? `${greeting(vorname)} der Vorstand hat deinen Antrag geprüft und dich als Alumni freigeschaltet. Dein Profil im Intranet zeigt ab sofort die Rolle „Alumni“.`
        : `${greeting(vorname)} der Vorstand hat deinen Antrag auf den Alumni-Status geprüft und ihn leider abgelehnt. Bei Fragen melde dich gern beim Vorstand.`;
      const rows: Array<[string, string]> = [
        ["Entscheidung", approved ? "Freigeschaltet" : "Abgelehnt"],
        ["Entschieden am", formatDateTime(p.handled_at ?? ev.created_at)],
        ["Rückfragen", TO_EMAILS[0] ?? ""],
      ];
      const r = renderRows(rows);
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, adminLink("/profile", "Mein Profil öffnen")),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: recipient ? [recipient] : [],
        replyTo: TO_EMAILS[0],
      };
    }
    case "task_deadline": {
      const vorname = str(extra.recipient?.vorname);
      const recipient = extra.recipient?.email ?? "";
      const overdue = Number(p.stage) >= 2;
      const taskTitle = str(p.title) || "Aufgabe";
      const title = overdue ? `Deadline erreicht: ${taskTitle}` : `Deadline naht: ${taskTitle}`;
      const intro = overdue
        ? `${greeting(vorname)} die Deadline deiner Aufgabe „${taskTitle}“ ist heute bzw. bereits überschritten.`
        : `${greeting(vorname)} die Deadline deiner Aufgabe „${taskTitle}“ ist in den nächsten Tagen.`;
      const rows: Array<[string, string]> = [
        ["Aufgabe", taskTitle],
        ["Deadline", formatDate(p.deadline)],
        ["Priorität", PRIORITY_LABELS[str(p.priority)] ?? str(p.priority)],
        ["Status", STATUS_LABELS[str(p.status)] ?? str(p.status)],
      ];
      const r = renderRows(rows);
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, adminLink("/admin", "Aufgaben öffnen")),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: recipient ? [recipient] : [],
        replyTo: TO_EMAILS[0],
      };
    }
    case "task_assigned": {
      const vorname = str(extra.recipient?.vorname);
      const recipient = extra.recipient?.email ?? "";
      const taskTitle = str(p.title) || "Aufgabe";
      const by = str(p.assigned_by_name) || "Jemand aus dem Vorstand";
      const coAssignees = Array.isArray(p.co_assignees) ? p.co_assignees.map(str).filter(Boolean) : [];
      const description = truncate(str(p.description), 1500);
      const title = `Neue Aufgabe für dich: ${taskTitle}`;
      const intro = `${greeting(vorname)} ${by} hat dir im Aufgaben-Board eine Aufgabe zugeteilt.`;
      const rows: Array<[string, string]> = [
        ["Aufgabe", taskTitle],
        ["Zugeteilt von", by],
        ["Deadline", str(p.deadline) ? formatDate(p.deadline) : "Keine"],
        ["Priorität", PRIORITY_LABELS[str(p.priority)] ?? str(p.priority)],
        ["Status", STATUS_LABELS[str(p.status)] ?? str(p.status)],
      ];
      if (coAssignees.length > 0) rows.push(["Ebenfalls zuständig", coAssignees.join(", ")]);
      const r = renderRows(rows);
      const afterRowsHtml = description
        ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#374151">${escapeHtml(description).replace(/\n/g, "<br />")}</p>`
        : "";
      const link = adminLink("/admin", "Aufgabe im Intranet öffnen");
      const footer = "Automatische Benachrichtigung aus dem ICR Intranet. Bei Fragen antworte einfach auf diese Mail.";
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, link, { footer, afterRowsHtml }),
        text: [
          title,
          "",
          intro,
          "",
          r.text,
          description ? `\nBeschreibung:\n${description}` : "",
          link ? `\n${link.label}: ${link.href}` : "",
          "",
          footer,
        ].join("\n"),
        to: recipient ? [recipient] : [],
        replyTo: extra.replyTo || TO_EMAILS[0],
      };
    }
    case "iban_changed": {
      const rows: Array<[string, string]> = [
        ["Name", name],
        ["E-Mail", str(p.email)],
        ["Neue IBAN (Ende)", str(p.iban_last4) ? `…${str(p.iban_last4)}` : "entfernt"],
        ["Bisherige IBAN (Ende)", str(p.old_iban_last4) ? `…${str(p.old_iban_last4)}` : "keine"],
        ["Zeitpunkt", formatDateTime(p.changed_at ?? ev.created_at)],
      ];
      const r = renderRows(rows);
      const title = `Bankverbindung geändert: ${name}`;
      const intro =
        p.by_board === true
          ? "Der Vorstand hat die IBAN dieses Mitglieds im Admin-Bereich korrigiert. Der nächste SEPA-Export kennzeichnet die Lastschrift als Mandatsänderung."
          : "Ein Mitglied hat seine IBAN im Profil geändert. Der nächste SEPA-Export kennzeichnet die Lastschrift als Mandatsänderung. Falls die Änderung unerwartet ist, bitte beim Mitglied nachfragen.";
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html, adminLink("/admin/members", "Mitglieder öffnen")),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: TO_EMAILS,
      };
    }
    case "test":
    default: {
      const rows: Array<[string, string]> = [
        ["Event-ID", ev.id],
        ["Typ", ev.type],
        ["Zeitpunkt", formatDateTime(ev.created_at)],
        ["Payload", JSON.stringify(p)],
      ];
      const r = renderRows(rows);
      const title = "Testbenachrichtigung ICR Intranet";
      const intro = "Wenn du diese E-Mail liest, funktioniert die Kette Datenbank → Edge Function → Resend.";
      return {
        subject: title,
        html: wrapHtml(title, intro, r.html),
        text: `${title}\n\n${intro}\n\n${r.text}`,
        to: TO_EMAILS,
      };
    }
  }
}

async function sendViaResend(mail: Mail): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY fehlt (Edge Function Secret)");
  if (mail.to.length === 0) throw new Error("Kein Empfänger für diese Mail (NOTIFY_TO_EMAIL bzw. payload.recipient leer)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: mail.to,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      subject: cleanSubject(mail.subject),
      html: mail.html,
      text: mail.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 500)}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Event-Ankündigung an viele Empfänger: jede Mail einzeln adressiert, in Batches à 100.
 * Nach jedem Batch wird payload.sent_count gespeichert, damit ein Retry nicht doppelt versendet.
 * Der Idempotency-Key schützt zusätzlich, falls der Batch durchging, das Speichern aber nicht.
 */
async function sendAnnouncement(
  supabase: ReturnType<typeof createClient>,
  ev: NotificationEvent
): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY fehlt (Edge Function Secret)");
  const recipients = (Array.isArray(ev.payload?.recipients) ? ev.payload.recipients : [])
    .map((r) => str(r))
    .filter(Boolean);
  if (recipients.length === 0) throw new Error("Keine Empfänger in payload.recipients");
  // Liste nicht umsortieren/filtern (sent_count zeigt auf Positionen), sondern nur prüfen.
  const limit = ev.payload?.mode === "custom" ? MAX_CUSTOM_RECIPIENTS : MAX_ANNOUNCEMENT_RECIPIENTS;
  if (recipients.length > limit) {
    throw new Error(`Zu viele Empfänger (${recipients.length} > ${limit})`);
  }
  if (recipients.some((r) => !EMAIL_RE.test(r))) {
    throw new Error("Ungültige Empfängeradresse in payload.recipients");
  }

  const mail = buildEventAnnouncement(ev);
  let sent = Math.max(0, Number(ev.payload?.sent_count ?? 0) || 0);

  while (sent < recipients.length) {
    const chunk = recipients.slice(sent, sent + RESEND_BATCH_SIZE);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${ev.id}-${sent}`,
      },
      body: JSON.stringify(
        chunk.map((to) => ({
          from: FROM_EMAIL,
          to: [to],
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
          subject: cleanSubject(mail.subject),
          html: mail.html,
          text: mail.text,
        }))
      ),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status} nach ${sent}/${recipients.length} Mails: ${body.slice(0, 500)}`);
    }

    sent += chunk.length;
    await supabase
      .from("notification_events")
      .update({ payload: { ...ev.payload, sent_count: sent } })
      .eq("id", ev.id);
    ev.payload = { ...ev.payload, sent_count: sent };

    if (sent < recipients.length) await sleep(RESEND_BATCH_PAUSE_MS);
  }
}

type Result = { id: string; type: string; ok: boolean; error?: string };

async function processEvents(
  supabase: ReturnType<typeof createClient>,
  events: NotificationEvent[]
): Promise<Result[]> {
  const results: Result[] = [];

  for (const ev of events) {
    try {
      let emailConfirmed: boolean | null = null;
      if (ev.type === "member_registered") {
        const userId = str(ev.payload?.user_id);
        if (userId) {
          const { data } = await supabase.auth.admin.getUserById(userId);
          emailConfirmed = data?.user ? Boolean(data.user.email_confirmed_at) : null;
        }
      }

      const recipient =
        ev.type === "alumni_decided" || ev.type === "member_cancellation_confirmed"
          ? await resolveMemberRecipient(supabase, ev)
          : ev.type === "task_deadline" || ev.type === "task_assigned"
            ? await resolveAssigneeRecipient(supabase, ev)
            : null;
      // Antworten auf die Zuweisungs-Mail gehen an die Person, die zugeteilt hat.
      const replyTo =
        ev.type === "task_assigned"
          ? (await resolveAssigneeRecipient(supabase, ev, "assigned_by_profile_id"))?.email ?? null
          : null;

      if (ev.type === "event_announcement") {
        await sendAnnouncement(supabase, ev);
      } else {
        await sendViaResend(buildMail(ev, { emailConfirmed, recipient, replyTo }));
      }

      await supabase
        .from("notification_events")
        .update({ sent_at: new Date().toISOString(), attempts: ev.attempts + 1, last_error: null })
        .eq("id", ev.id);

      results.push({ id: ev.id, type: ev.type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("notification_events")
        .update({ attempts: ev.attempts + 1, last_error: message.slice(0, 1000) })
        .eq("id", ev.id);
      results.push({ id: ev.id, type: ev.type, ok: false, error: message });
      console.error(`notify-board: Event ${ev.id} (${ev.type}) fehlgeschlagen: ${message}`);
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!(await secretMatches(req.headers.get("x-notify-secret") ?? "", NOTIFY_SECRET))) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen" }, 500);
  }

  let eventId: string | null = null;
  let action: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { event_id?: unknown; action?: unknown };
    if (typeof body.event_id === "string" && body.event_id.trim()) {
      eventId = body.event_id.trim();
    }
    if (typeof body.action === "string" && body.action.trim()) {
      action = body.action.trim();
    }
  } catch {
    // leerer Body → Batch-Modus
  }

  // Health-Check für die Einrichtung: welche Secrets sieht die Function? Keine Werte, nur Namen und Längen.
  if (action === "health") {
    const matchingEnvNames = Object.keys(Deno.env.toObject())
      .filter((k) => /resend|notify|intranet/i.test(k))
      .sort();

    // Welche Absender-Domains sind in Resend verifiziert? (Nur Domainnamen und Status, keine Secrets.)
    let resendDomains: unknown = null;
    if (RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        const body = (await res.json().catch(() => null)) as
          | { data?: Array<{ name?: string; status?: string; region?: string }>; message?: string }
          | null;
        resendDomains = res.ok
          ? (body?.data ?? []).map((d) => ({ name: d.name, status: d.status, region: d.region }))
          : { error: `Resend ${res.status}: ${body?.message ?? ""}` };
      } catch (err) {
        resendDomains = { error: err instanceof Error ? err.message : String(err) };
      }
    }

    return json({
      ok: true,
      resend_api_key: { set: RESEND_API_KEY.length > 0, length: RESEND_API_KEY.length },
      resend_domains: resendDomains,
      notify_to: TO_EMAILS,
      notify_from: FROM_EMAIL,
      intranet_url: INTRANET_URL || null,
      matching_env_names: matchingEnvNames,
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("notification_events")
    .select("*")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);
  if (eventId) query = query.eq("id", eventId);

  const { data: events, error: loadError } = await query;
  if (loadError) {
    return json({ error: `Events konnten nicht geladen werden: ${loadError.message}` }, 500);
  }

  const pending = (events ?? []) as NotificationEvent[];
  const work = processEvents(supabase, pending);

  // Rundmails an viele Mitglieder dauern länger als der pg_net-Timeout (8 s):
  // sofort antworten und im Hintergrund weiterarbeiten.
  if (pending.some((ev) => ev.type === "event_announcement")) {
    EdgeRuntime.waitUntil(work);
    return json({ accepted: pending.length }, 202);
  }

  const results = await work;
  const failed = results.filter((r) => !r.ok).length;
  return json({ processed: results.length, failed, results }, failed > 0 ? 502 : 200);
});
