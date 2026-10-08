import "server-only";
import { cache } from "react";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireRole, requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { EVENT_TIME_ZONE, formatEventDate, formatTimeRange, isEventPast } from "@/lib/events";
import type { AdminCounts, DashboardEvent, DashboardNewsItem } from "@/components/dashboard/types";

/*
 * Daten der Übersicht (/dashboard).
 *
 * Bewusst KEIN "use server": Das hier sind keine Server Actions, also nicht per POST von außen
 * aufrufbar, sondern nur aus Server-Komponenten.
 *
 * - Was das eingeloggte Mitglied ohnehin sehen darf (Events, News, eigene Anmeldungen, eigenes
 *   Profil), liest der normale Supabase-Client mit der Sitzung des Mitglieds, also unter RLS.
 * - Die Zählwerte der Verwaltungszeile brauchen fremde Zeilen: erst requireRole(["admin", "board"])
 *   (gleiche Rollen wie der Admin-Bereich), dann Service Role. Den Server verlassen nur Zahlen.
 */

// ---------------------------------------------------------------------------
// Datum in Europe/Berlin (Server läuft in Produktion in UTC)
// ---------------------------------------------------------------------------

type Ymd = { y: number; m: number; d: number };

function berlinToday(): Ymd {
  // en-CA formatiert als JJJJ-MM-TT.
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { y, m, d };
}

function isoDate({ y, m, d }: Ymd, addDays = 0): string {
  return new Date(Date.UTC(y, m - 1, d + addDays)).toISOString().slice(0, 10);
}

function daysBetween(today: Ymd, date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.y, today.m - 1, today.d)) / 86_400_000);
}

function relativeLabel(days: number): string {
  if (days < 0) return "Läuft";
  if (days === 0) return "Heute";
  if (days === 1) return "Morgen";
  if (days < 14) return `In ${days} Tagen`;
  if (days < 60) return `In ${Math.round(days / 7)} Wochen`;
  const months = Math.round(days / 30);
  return months === 1 ? "In einem Monat" : `In ${months} Monaten`;
}

const stripDot = (s: string) => s.replace(/\.$/, "");

/** Laufendes Semester wie in Insights: Wintersemester ab 1. Oktober, Sommersemester ab 1. April. */
function currentSemester(today: Ymd): { start: string; label: string } {
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  const { y, m } = today;
  if (m >= 10) return { start: `${y}-10-01`, label: `WiSe ${yy(y)}/${yy(y + 1)}` };
  if (m >= 4) return { start: `${y}-04-01`, label: `SoSe ${yy(y)}` };
  return { start: `${y - 1}-10-01`, label: `WiSe ${yy(y - 1)}/${yy(y)}` };
}

/** „Donnerstag, 8. Oktober“ */
export function todayLabel(): string {
  return new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: EVENT_TIME_ZONE,
  });
}

/** „Oktober 2026“ */
export function monthLabel(): string {
  return new Date().toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: EVENT_TIME_ZONE,
  });
}

// ---------------------------------------------------------------------------
// Events + eigene Anmeldungen (RLS)
// ---------------------------------------------------------------------------

export type DashboardEvents = {
  /** Alle kommenden Events, aufsteigend. */
  upcoming: DashboardEvent[];
  /** Davon die, bei denen das Mitglied angemeldet ist. */
  registered: DashboardEvent[];
};

/**
 * Kommende Events und die eigenen Anmeldungen, beides mit der Sitzung des Mitglieds (RLS:
 * Events lesen alle Eingeloggten, Anmeldungen hier nur die eigenen per user_id).
 * Einmal pro Request (React cache), weil zwei Abschnitte der Seite sie brauchen.
 */
export const getDashboardEvents = cache(async (): Promise<DashboardEvents | null> => {
  const auth = await requireUser();
  if (!auth.ok) return null;

  const supabase = await getCachedSupabase();
  const today = berlinToday();
  // Ab gestern: ein Event über Mitternacht läuft heute noch.
  const from = isoDate(today, -1);

  const [eventsRes, regsRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, event_date, event_time, end_time, location, requires_registration")
      .gte("event_date", from)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true, nullsFirst: true })
      .limit(60),
    supabase.from("event_registrations").select("event_id").eq("user_id", auth.user.id),
  ]);

  if (eventsRes.error) {
    console.error("getDashboardEvents (Events):", eventsRes.error);
    return null;
  }
  if (regsRes.error) console.error("getDashboardEvents (Anmeldungen):", regsRes.error);

  const mine = new Set((regsRes.data ?? []).map((r) => String(r.event_id)));
  const now = Date.now();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const upcoming: DashboardEvent[] = [];
  for (const row of eventsRes.data ?? []) {
    const e = {
      event_date: String(row.event_date ?? ""),
      event_time: str(row.event_time),
      end_time: str(row.end_time),
    };
    if (!e.event_date || isEventPast(e, now)) continue;
    const days = daysBetween(today, e.event_date);
    upcoming.push({
      id: String(row.id),
      title: String(row.title ?? ""),
      dateLabel: formatEventDate(e.event_date),
      day: String(Number(e.event_date.slice(8, 10))),
      month: stripDot(formatEventDate(e.event_date, { month: "short" })),
      weekday: stripDot(formatEventDate(e.event_date, { weekday: "short" })),
      timeLabel: formatTimeRange(e.event_time, e.end_time),
      location: str(row.location),
      relative: relativeLabel(days),
      soon: days <= 1,
      requiresRegistration: !!row.requires_registration,
      registered: mine.has(String(row.id)),
    });
  }

  return { upcoming, registered: upcoming.filter((e) => e.registered) };
});

// ---------------------------------------------------------------------------
// News (RLS)
// ---------------------------------------------------------------------------

/** Die neuesten News; „ungelesen“ = neuer als der letzte Besuch der News-Seite (eigenes Profil). */
export async function getDashboardNews(limit = 3): Promise<DashboardNewsItem[] | null> {
  const auth = await requireUser();
  if (!auth.ok) return null;

  const supabase = await getCachedSupabase();
  const { data, error } = await supabase
    .from("news")
    .select("id, title, content, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getDashboardNews:", error);
    return null;
  }

  const lastRead = Date.parse(String(auth.profile?.["letzter_news_aufruf"] ?? ""));
  const thisYear = berlinToday().y;

  return (data ?? []).map((row) => {
    const createdAt = String(row.created_at ?? "");
    const created = new Date(createdAt);
    const valid = !Number.isNaN(created.getTime());
    const sameYear =
      valid &&
      Number(created.toLocaleDateString("de-DE", { year: "numeric", timeZone: EVENT_TIME_ZONE })) === thisYear;
    const text = String(row.content ?? "").replace(/\s+/g, " ").trim();
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      excerpt: text.length > 180 ? `${text.slice(0, 180).trimEnd()} …` : text,
      createdAt,
      dateLabel: valid
        ? created.toLocaleDateString("de-DE", {
            day: "numeric",
            month: "short",
            ...(sameYear ? {} : { year: "numeric" }),
            timeZone: EVENT_TIME_ZONE,
          })
        : "",
      // Nie auf der News-Seite gewesen: alles gilt als neu (wie der Hinweis in der Sidebar).
      unread: valid && (Number.isNaN(lastRead) || created.getTime() > lastRead),
    };
  });
}

// ---------------------------------------------------------------------------
// Verwaltung: Zählwerte (nur admin/board, Service Role)
// ---------------------------------------------------------------------------

export async function getAdminCounts(): Promise<AdminCounts | null> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return null;

  const admin = createServiceClient();
  const semester = currentSemester(berlinToday());

  const [profilesRes, alumniRes, bvhRes] = await Promise.all([
    // Nur die drei Spalten, die gezählt werden: keine Namen, Kontakt- oder Bankdaten.
    admin.from("profiles").select('"Status", "Rolle", "Datum_Antrag"').range(0, 9999),
    admin.from("alumni_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("bvh_login_requests").select("id", { count: "exact", head: true }).eq("handled", false),
  ]);

  if (profilesRes.error || alumniRes.error || bvhRes.error) {
    console.error("getAdminCounts:", profilesRes.error ?? alumniRes.error ?? bvhRes.error);
    return null;
  }

  let applicants = 0;
  let activeMembers = 0;
  let newThisSemester = 0;
  for (const row of profilesRes.data ?? []) {
    const raw = row as Record<string, unknown>;
    const status = String(raw["Status"] ?? "").trim().toLowerCase();
    const role = String(raw["Rolle"] ?? "").trim().toLowerCase();
    const isAlumni = role === "alumni" || status === "alumni";

    if (status === "applicant") {
      applicants++;
      continue;
    }
    if (status === "cancelled") continue;
    // „Aktiv“ wie in Insights: Status active, Alumni nicht mitgezählt.
    if (status === "active" && !isAlumni) activeMembers++;
    // Neuzugang: Antrag ab Semesterbeginn und freigegeben (nicht offen, nicht ausgetreten).
    const antrag = String(raw["Datum_Antrag"] ?? "").slice(0, 10);
    if (antrag && antrag >= semester.start) newThisSemester++;
  }

  return {
    applicants,
    alumniRequests: alumniRes.count ?? 0,
    bvhRequests: bvhRes.count ?? 0,
    activeMembers,
    newThisSemester,
    semesterLabel: semester.label,
  };
}
