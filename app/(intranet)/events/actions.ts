"use server";

import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireRole, requireUser, type Role } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isSafeId } from "@/lib/validation";
import {
  EVENT_IMAGE_BUCKET,
  MAIL_TO_ALL_ENABLED,
  MAX_CUSTOM_RECIPIENTS,
  MAX_EVENT_DAYS,
  MAX_PARTICIPANTS_LIMIT,
  capacityBelowRegistrationsMessage,
  eventEndTimestamp,
  eventStartTimestamp,
  isValidEmail,
  type AnnouncementTarget,
  type EventCapacity,
  type EventCore,
  type RegistrationStatus,
} from "@/lib/events";

export type EventListItem = EventCore &
  EventCapacity & {
    created_at: string;
    registration_count: number;
    waitlist_count: number;
    /** Ist die angemeldete Person für dieses Event angemeldet? (Keine fremden User-IDs nach außen.) */
    is_registered: boolean;
    /** Steht die angemeldete Person auf der Warteliste? */
    is_waitlisted: boolean;
  };

/** Intern (Cache): mit den User-IDs der Anmeldungen und der Warteliste. */
type CachedEvent = Omit<EventListItem, "is_registered" | "is_waitlisted"> & {
  registered_user_ids: string[];
  waitlisted_user_ids: string[];
};

export type MyEventItem = Pick<EventCore, "id" | "title" | "event_date" | "end_date" | "event_time" | "end_time" | "location">;

export type MyEventsResult = {
  upcoming: MyEventItem[];
  attended: MyEventItem[];
};

export type EventParticipant = {
  user_id: string;
  vorname: string;
  nachname: string;
  studiengang: string;
  rolle: string;
  registered_at: string;
};

export type EventAnnouncement = {
  id: string;
  created_at: string;
  sent_at: string | null;
  mode: "all" | "custom";
  recipient_count: number;
  sent_count: number;
  last_error: string | null;
};

const EVENTS_TAG = "events";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVENT_DAYS_MS = MAX_EVENT_DAYS * 24 * 60 * 60 * 1000;
const IMAGE_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

async function requireAdmin(): Promise<{ userId: string; role: Role } | { error: string }> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return { error: auth.error };
  return { userId: auth.user.id, role: auth.role };
}

/** Abstand zwischen zwei Rundmails an alle Mitglieder zum selben Event. */
const ANNOUNCEMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Prüft Ziel und Berechtigung einer Event-Mail (vor dem Anlegen bzw. Versenden). */
function checkAnnouncementTarget(target: AnnouncementTarget | null | undefined, role: Role): string {
  if (!target) return "";
  if (target.mode !== "all" && target.mode !== "custom") return "Ungültige Empfängerauswahl.";
  if (target.mode === "all" && !MAIL_TO_ALL_ENABLED)
    return "Rundmails an alle Mitglieder sind vorübergehend gesperrt (Mail-Kontingent).";
  if (target.mode === "custom") {
    // Mails an frei eingegebene Adressen nur durch den Vorstand.
    if (role !== "board") return "Mails an einzelne Adressen darf nur der Vorstand verschicken.";
    return normalizeCustomEmails(target.emails).error;
  }
  return "";
}

function invalidateEvents() {
  updateTag(EVENTS_TAG);
  revalidatePath("/profile");
}

function toEventCore(e: Record<string, unknown>): EventCore {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    id: String(e.id),
    title: String(e.title ?? ""),
    description: str(e.description),
    event_date: String(e.event_date ?? ""),
    end_date: str(e.end_date),
    event_time: str(e.event_time),
    end_time: str(e.end_time),
    location: str(e.location),
    organizer: str(e.organizer),
    image_url: str(e.image_url),
    requires_registration: !!e.requires_registration,
  };
}

function toEventCapacity(e: Record<string, unknown>): EventCapacity {
  const max = Number(e.max_participants);
  return {
    max_participants: e.max_participants !== null && Number.isInteger(max) && max > 0 ? max : null,
    registration_closed: e.registration_closed === true,
  };
}

function groupUserIds(rows: Record<string, unknown>[] | null): Map<string, string[]> {
  const byEvent = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const list = byEvent.get(r.event_id as string) ?? [];
    list.push(r.user_id as string);
    byEvent.set(r.event_id as string, list);
  }
  return byEvent;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

const fetchEvents = unstable_cache(
  async (): Promise<CachedEvent[]> => {
    const admin = createServiceClient();
    const [{ data: events, error }, { data: regs }, { data: waiting, error: waitError }] = await Promise.all([
      admin
        .from("events")
        .select(
          "id, title, description, event_date, end_date, event_time, end_time, location, organizer, image_url, requires_registration, max_participants, registration_closed, created_at"
        )
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: true }),
      admin.from("event_registrations").select("event_id, user_id").range(0, 49999),
      admin
        .from("event_waitlist")
        .select("event_id, user_id")
        .order("created_at", { ascending: true })
        .range(0, 49999),
    ]);
    if (error || !events) {
      if (error) console.error("fetchEvents:", error);
      return [];
    }
    if (waitError) console.error("fetchEvents (Warteliste):", waitError);

    const registered = groupUserIds(regs);
    const waitlisted = groupUserIds(waiting);

    return events.map((e) => {
      const ids = registered.get(e.id as string) ?? [];
      const waitIds = waitlisted.get(e.id as string) ?? [];
      return {
        ...toEventCore(e),
        ...toEventCapacity(e),
        created_at: String(e.created_at ?? ""),
        registration_count: ids.length,
        waitlist_count: waitIds.length,
        registered_user_ids: ids,
        waitlisted_user_ids: waitIds,
      };
    });
  },
  ["events-list-v5"],
  { revalidate: 60, tags: [EVENTS_TAG] }
);

/** Alle Events, aufsteigend nach Beginn, mit Anmeldestatus der angemeldeten Person. */
export async function getEvents(): Promise<EventListItem[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];
  const userId = auth.user.id;
  return (await fetchEvents()).map(({ registered_user_ids, waitlisted_user_ids, ...e }) => ({
    ...e,
    is_registered: registered_user_ids.includes(userId),
    is_waitlisted: waitlisted_user_ids.includes(userId),
  }));
}

export async function getEvent(eventId: string): Promise<EventListItem | null> {
  if (!isSafeId(eventId)) return null;
  const events = await getEvents();
  return events.find((e) => e.id === eventId) ?? null;
}

export async function getMyEvents(): Promise<MyEventsResult> {
  const auth = await requireUser();
  if (!auth.ok) return { upcoming: [], attended: [] };
  const user = auth.user;

  const now = Date.now();
  const mine = (await fetchEvents()).filter((e) => e.registered_user_ids.includes(user.id));
  const pick = (e: CachedEvent): MyEventItem => ({
    id: e.id,
    title: e.title,
    event_date: e.event_date,
    end_date: e.end_date,
    event_time: e.event_time,
    end_time: e.end_time,
    location: e.location,
  });

  return {
    upcoming: mine.filter((e) => eventEndTimestamp(e) >= now).map(pick),
    attended: mine
      .filter((e) => eventEndTimestamp(e) < now)
      .sort((a, b) => eventStartTimestamp(b) - eventStartTimestamp(a))
      .map(pick),
  };
}

export async function getEventWithParticipants(eventId: string): Promise<{
  event: EventListItem;
  participants: EventParticipant[];
  /** In Nachrück-Reihenfolge; registered_at = eingetragen am. */
  waitlist: EventParticipant[];
  announcements: EventAnnouncement[];
} | null> {
  const auth = await requireAdmin();
  if ("error" in auth) return null;
  if (!isSafeId(eventId)) return null;

  const event = await getEvent(eventId);
  if (!event) return null;

  const admin = createServiceClient();
  const [{ data: regs }, { data: waiting }, { data: notifications }] = await Promise.all([
    admin
      .from("event_registrations")
      .select("user_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    admin
      .from("event_waitlist")
      .select("user_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    admin
      .from("notification_events")
      .select("id, created_at, sent_at, last_error, payload")
      .eq("type", "event_announcement")
      .eq("payload->>event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const userIds = [...(regs ?? []), ...(waiting ?? [])].map((r) => r.user_id as string).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select('user_id, "Vorname", "Nachname", "Studiengang / Fach", "Rolle"')
        .in("user_id", userIds)
    : { data: [] as Record<string, unknown>[] };

  const profileByUser = new Map<string, Record<string, unknown>>();
  for (const p of profiles ?? []) profileByUser.set(String(p.user_id), p);

  const toParticipant = (r: Record<string, unknown>): EventParticipant => {
    const p = profileByUser.get(r.user_id as string) ?? {};
    return {
      user_id: r.user_id as string,
      vorname: String(p["Vorname"] ?? "").trim(),
      nachname: String(p["Nachname"] ?? "").trim(),
      studiengang: String(p["Studiengang / Fach"] ?? "").trim(),
      rolle: String(p["Rolle"] ?? "").trim(),
      registered_at: String(r.created_at ?? ""),
    };
  };
  const participants = (regs ?? []).map(toParticipant);
  const waitlist = (waiting ?? []).map(toParticipant);

  const announcements: EventAnnouncement[] = (notifications ?? []).map((n) => {
    const payload = (n.payload ?? {}) as Record<string, unknown>;
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
    return {
      id: String(n.id),
      created_at: String(n.created_at),
      sent_at: (n.sent_at as string | null) ?? null,
      mode: payload.mode === "custom" ? "custom" : "all",
      recipient_count: recipients.length,
      sent_count: Number(payload.sent_count ?? 0),
      last_error: (n.last_error as string | null) ?? null,
    };
  });

  return { event, participants, waitlist, announcements };
}

/** Anzahl aktiver Mitglieder, die eine Rundmail bekämen (für die Anzeige im Admin-Formular). */
export async function getAnnouncementRecipientCount(): Promise<number> {
  const auth = await requireAdmin();
  if ("error" in auth) return 0;
  const { emails } = await resolveRecipients({ mode: "all" });
  return emails.length;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

export type EventFormInput = {
  title: string;
  description: string;
  event_date: string;
  /** Letzter Tag bei mehrtägigen Events, "" = eintägig. */
  end_date: string;
  event_time: string;
  end_time: string;
  location: string;
  organizer: string;
  requires_registration: boolean;
  /** null = unbegrenzt. */
  max_participants: number | null;
  registration_closed: boolean;
};

export type CreateEventInput = EventFormInput & {
  /** Pfad im Bucket event-images, vom Client direkt hochgeladen (`<userId>/<uuid>.<ext>`). */
  image_path: string | null;
  announce: AnnouncementTarget | null;
};

export type UpdateEventInput = EventFormInput & {
  /** Bild behalten, entfernen oder durch einen neuen Upload ersetzen. */
  image: "keep" | "remove" | { path: string };
};

export type CreateEventResult = {
  id: string | null;
  error: string;
  /** Anzahl Empfänger, falls eine Mail in Auftrag gegeben wurde. */
  announced: number;
  announceError: string;
};

/** Gemeinsame Validierung für Anlegen und Bearbeiten. Liefert die DB-Spalten oder eine Fehlermeldung. */
function parseEventFields(input: EventFormInput) {
  const title = input.title?.trim() ?? "";
  const eventDate = input.event_date?.trim() ?? "";
  const endDate = input.end_date?.trim() ?? "";
  const eventTime = input.event_time?.trim().slice(0, 5) ?? "";
  const endTime = input.end_time?.trim().slice(0, 5) ?? "";

  if (!title) return { error: "Titel ist Pflicht." };
  if (title.length > 200) return { error: "Titel ist zu lang (max. 200 Zeichen)." };
  if (!DATE_RE.test(eventDate) || Number.isNaN(Date.parse(eventDate))) return { error: "Bitte ein gültiges Datum wählen." };
  if (endDate && (!DATE_RE.test(endDate) || Number.isNaN(Date.parse(endDate))))
    return { error: "Bitte ein gültiges Enddatum wählen." };
  if (endDate && endDate < eventDate) return { error: "Das Enddatum darf nicht vor dem Startdatum liegen." };
  if (endDate && Date.parse(endDate) - Date.parse(eventDate) > MAX_EVENT_DAYS_MS)
    return { error: `Ein Event darf höchstens ${MAX_EVENT_DAYS} Tage nach dem Start enden.` };
  // Gleicher Tag = eintägig; die DB erlaubt end_date nur nach event_date.
  const multiDay = !!endDate && endDate > eventDate;
  if (eventTime && !TIME_RE.test(eventTime)) return { error: "Ungültige Startzeit." };
  if (endTime && !TIME_RE.test(endTime)) return { error: "Ungültige Endzeit." };
  if (endTime && !eventTime) return { error: "Für eine Endzeit bitte auch eine Startzeit angeben." };
  if (!multiDay && endTime && endTime === eventTime) return { error: "Endzeit muss nach der Startzeit liegen." };
  if ((input.description ?? "").length > 5000) return { error: "Beschreibung ist zu lang (max. 5000 Zeichen)." };

  const requiresRegistration = !!input.requires_registration;
  const max = input.max_participants ?? null;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > MAX_PARTICIPANTS_LIMIT))
    return { error: `Teilnehmerzahl bitte als ganze Zahl von 1 bis ${MAX_PARTICIPANTS_LIMIT} angeben.` };

  return {
    error: "",
    row: {
      title,
      description: input.description?.trim() || null,
      event_date: eventDate,
      end_date: multiDay ? endDate : null,
      event_time: eventTime || null,
      end_time: endTime || null,
      location: input.location?.trim() || null,
      organizer: input.organizer?.trim() || null,
      requires_registration: requiresRegistration,
      // Ohne Anmeldung gibt es weder Begrenzung noch Schließen.
      max_participants: requiresRegistration ? max : null,
      registration_closed: requiresRegistration && !!input.registration_closed,
    },
  };
}

async function countRegistrations(eventId: string): Promise<number | null> {
  const { count, error } = await createServiceClient()
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) {
    console.error("countRegistrations:", error);
    return null;
  }
  return count ?? 0;
}

/** Öffentliche URL zu einem frisch hochgeladenen Bild – nur aus dem eigenen Upload-Ordner, keine beliebigen URLs. */
async function imageUrlFromPath(path: string, userId: string): Promise<string | null> {
  if (!IMAGE_PATH_RE.test(path) || !path.startsWith(`${userId}/`)) return null;
  const supabase = await getCachedSupabase();
  return supabase.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeStoredImage(imageUrl: string | null) {
  const marker = `/object/public/${EVENT_IMAGE_BUCKET}/`;
  if (!imageUrl?.includes(marker)) return;
  const path = decodeURIComponent(imageUrl.split(marker)[1] ?? "");
  if (!path) return;
  const supabase = await getCachedSupabase();
  await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([path]);
}

export async function createEvent(input: CreateEventInput): Promise<CreateEventResult> {
  const fail = (error: string): CreateEventResult => ({ id: null, error, announced: 0, announceError: "" });

  const auth = await requireAdmin();
  if ("error" in auth) return fail(auth.error);

  // Neue Veranstaltungen starten immer mit offener Anmeldung.
  const parsed = parseEventFields({ ...input, registration_closed: false });
  if (!parsed.row) return fail(parsed.error);

  let imageUrl: string | null = null;
  if (input.image_path) {
    imageUrl = await imageUrlFromPath(input.image_path, auth.userId);
    if (!imageUrl) return fail("Ungültiges Bild.");
  }

  const targetError = checkAnnouncementTarget(input.announce, auth.role);
  if (targetError) return fail(targetError);

  const supabase = await getCachedSupabase();
  const { data: row, error } = await supabase
    .from("events")
    .insert({ ...parsed.row, image_url: imageUrl, created_by: auth.userId })
    .select("id")
    .single();

  if (error || !row) {
    console.error("createEvent:", error);
    return fail("Event konnte nicht gespeichert werden. Bitte Eingaben prüfen und erneut versuchen.");
  }

  invalidateEvents();

  const id = row.id as string;
  if (!input.announce) return { id, error: "", announced: 0, announceError: "" };

  const result = await enqueueAnnouncement(id, input.announce, auth.userId);
  return { id, error: "", announced: result.count, announceError: result.error };
}

export async function updateEvent(eventId: string, input: UpdateEventInput): Promise<{ error: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  if (!isSafeId(eventId)) return { error: "Event nicht gefunden." };

  const parsed = parseEventFields(input);
  if (!parsed.row) return { error: parsed.error };

  const supabase = await getCachedSupabase();
  const { data: current } = await supabase
    .from("events")
    .select("image_url, max_participants")
    .eq("id", eventId)
    .maybeSingle();
  if (!current) return { error: "Event nicht gefunden." };
  const oldImageUrl = (current.image_url as string | null) ?? null;

  // Vorab prüfen für eine verständliche Meldung; verbindlich prüft der DB-Trigger events_capacity_change.
  const newMax = parsed.row.max_participants;
  if (newMax !== null && newMax !== current.max_participants) {
    const count = await countRegistrations(eventId);
    if (count === null) return { error: "Änderungen konnten nicht gespeichert werden." };
    if (newMax < count) return { error: capacityBelowRegistrationsMessage(count) };
  }

  let imageUrl = oldImageUrl;
  if (input.image === "remove") {
    imageUrl = null;
  } else if (input.image !== "keep") {
    imageUrl = await imageUrlFromPath(input.image.path, auth.userId);
    if (!imageUrl) return { error: "Ungültiges Bild." };
  }

  const { data: updated, error } = await supabase
    .from("events")
    .update({ ...parsed.row, image_url: imageUrl })
    .eq("id", eventId)
    .select("id");
  if (error?.message === "capacity_below_registrations") {
    // Zwischen Vorabprüfung und Speichern hat sich noch jemand angemeldet.
    const count = await countRegistrations(eventId);
    return {
      error:
        count === null
          ? "Die Teilnehmerzahl darf nicht unter der Zahl der Anmeldungen liegen."
          : capacityBelowRegistrationsMessage(count),
    };
  }
  if (error || !updated?.length) {
    console.error("updateEvent:", error);
    return { error: "Änderungen konnten nicht gespeichert werden." };
  }

  // Altes Bild erst nach erfolgreichem Update aus dem Storage löschen.
  if (oldImageUrl && oldImageUrl !== imageUrl) await removeStoredImage(oldImageUrl);

  invalidateEvents();
  revalidatePath(`/admin/events/${eventId}`);
  return { error: "" };
}

export async function deleteEvent(eventId: string): Promise<{ error: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  if (!isSafeId(eventId)) return { error: "Event nicht gefunden." };

  const supabase = await getCachedSupabase();
  const { data: deleted, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("image_url");
  if (error) return { error: "Event konnte nicht entfernt werden." };
  if (!deleted?.length) return { error: "Event nicht gefunden." };

  // Bild aus dem Storage entfernen (Anmeldungen löscht die DB per ON DELETE CASCADE).
  await removeStoredImage((deleted[0].image_url as string | null) ?? null);

  invalidateEvents();
  return { error: "" };
}

const JOIN_ERRORS: Record<string, string> = {
  registration_closed: "Die Anmeldung ist geschlossen.",
  event_not_found: "Event nicht gefunden.",
  not_allowed: "Anmelden können nur aktive Mitglieder.",
};

/**
 * Anmelden oder, wenn ausgebucht, auf die Warteliste. Entscheidet die DB (event_join) unter einer
 * Sperre auf dem Event, damit auch der letzte Platz nur einmal vergeben wird.
 */
export async function joinEvent(eventId: string): Promise<{ error: string; status: RegistrationStatus }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error, status: "none" };
  if (!isSafeId(eventId)) return { error: "Event nicht gefunden.", status: "none" };

  const supabase = await getCachedSupabase();
  const { data, error } = await supabase.rpc("event_join", { p_event_id: eventId });

  if (error?.code === "PGRST202") {
    // Funktion fehlt noch (Migration 20261108120000 nicht ausgeführt): direkt anmelden wie bisher.
    const { error: insertError } = await supabase
      .from("event_registrations")
      .insert({ event_id: eventId, user_id: auth.user.id });
    if (insertError && insertError.code !== "23505") {
      return { error: "Anmeldung nicht möglich (Event vorbei oder ohne Anmeldung).", status: "none" };
    }
    invalidateEvents();
    return { error: "", status: "registered" };
  }
  if (error) {
    const known = JOIN_ERRORS[error.message];
    if (!known) console.error("joinEvent:", error);
    return { error: known ?? "Anmeldung fehlgeschlagen. Bitte erneut versuchen.", status: "none" };
  }

  invalidateEvents();
  return { error: "", status: data === "waitlisted" ? "waitlisted" : "registered" };
}

/** Abmelden bzw. von der Warteliste austragen. Ein frei gewordener Platz wird in der DB sofort nachbesetzt. */
export async function leaveEvent(
  eventId: string,
  from: Exclude<RegistrationStatus, "none">
): Promise<{ error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  if (!isSafeId(eventId)) return { error: "Event nicht gefunden." };

  const supabase = await getCachedSupabase();
  const { data: deleted, error } = await supabase
    .from(from === "waitlisted" ? "event_waitlist" : "event_registrations")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", auth.user.id)
    .select("id");
  if (error) {
    console.error("leaveEvent:", error);
    return { error: from === "waitlisted" ? "Austragen fehlgeschlagen." : "Abmeldung fehlgeschlagen." };
  }

  invalidateEvents();
  // Stand hat sich inzwischen geändert (z. B. von der Warteliste nachgerückt): nichts gelöscht.
  if (!deleted?.length) return { error: "Dein Stand hat sich geändert. Bitte prüfe ihn auf der Seite." };
  return { error: "" };
}

/** Anmeldung manuell schließen oder wieder öffnen (Admin/Vorstand). Beim Öffnen rückt die Warteliste nach. */
export async function setRegistrationClosed(eventId: string, closed: boolean): Promise<{ error: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  if (!isSafeId(eventId)) return { error: "Event nicht gefunden." };

  const supabase = await getCachedSupabase();
  const { data: updated, error } = await supabase
    .from("events")
    .update({ registration_closed: closed })
    .eq("id", eventId)
    .eq("requires_registration", true)
    .select("id");
  if (error || !updated?.length) {
    if (error) console.error("setRegistrationClosed:", error);
    return { error: "Änderung konnte nicht gespeichert werden." };
  }

  invalidateEvents();
  revalidatePath(`/admin/events/${eventId}`);
  return { error: "" };
}

export async function sendEventAnnouncement(
  eventId: string,
  target: AnnouncementTarget
): Promise<{ count: number; error: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { count: 0, error: auth.error };
  if (!isSafeId(eventId)) return { count: 0, error: "Event nicht gefunden." };
  if (!target) return { count: 0, error: "Ungültige Empfängerauswahl." };
  const targetError = checkAnnouncementTarget(target, auth.role);
  if (targetError) return { count: 0, error: targetError };
  const result = await enqueueAnnouncement(eventId, target, auth.userId);
  revalidatePath(`/admin/events/${eventId}`);
  return result;
}

// ---------------------------------------------------------------------------
// Event-Ankündigung per Mail
// ---------------------------------------------------------------------------
// Die Mail wird nicht hier verschickt, sondern als Zeile in die Outbox notification_events
// geschrieben. Der DB-Trigger ruft die Edge Function notify-board auf, die über Resend
// in Batches verschickt (jede Mail einzeln adressiert, keine sichtbaren Empfängerlisten).

function normalizeCustomEmails(raw: unknown): { emails: string[]; error: string } {
  const list = Array.isArray(raw) ? raw : [];
  const emails = [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return { emails, error: "Bitte mindestens eine E-Mail-Adresse angeben." };
  if (emails.length > MAX_CUSTOM_RECIPIENTS)
    return { emails, error: `Maximal ${MAX_CUSTOM_RECIPIENTS} einzelne Adressen.` };
  const invalid = emails.find((e) => !isValidEmail(e));
  if (invalid) return { emails, error: `Ungültige E-Mail-Adresse: ${invalid}` };
  return { emails, error: "" };
}

async function resolveRecipients(target: AnnouncementTarget): Promise<{ emails: string[]; error: string }> {
  if (target.mode === "custom") return normalizeCustomEmails(target.emails);

  // Alle Mitglieder außer Alumni und Ausgetretenen (Status cancelled).
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select('"E-Mail", "Status"')
    .in("Rolle", ["member", "admin", "board"])
    .range(0, 9999);
  if (error) return { emails: [], error: "Empfänger konnten nicht geladen werden." };

  const emails = new Set<string>();
  for (const p of data ?? []) {
    const status = String(p["Status"] ?? "").trim().toLowerCase();
    // Keine Ausgetretenen und keine offenen Mitgliedsanträge.
    if (status === "cancelled" || status === "applicant") continue;
    const email = String(p["E-Mail"] ?? "").trim().toLowerCase();
    if (isValidEmail(email)) emails.add(email);
  }
  return { emails: [...emails], error: "" };
}

async function enqueueAnnouncement(
  eventId: string,
  target: AnnouncementTarget,
  requestedBy: string
): Promise<{ count: number; error: string }> {
  const admin = createServiceClient();
  const { data: row, error: evError } = await admin
    .from("events")
    .select("id, title, description, event_date, end_date, event_time, end_time, location, organizer, image_url, requires_registration")
    .eq("id", eventId)
    .maybeSingle();
  if (evError || !row) return { count: 0, error: "Event nicht gefunden." };

  // Rundmail an alle höchstens einmal pro Event und 24 Stunden.
  if (target.mode === "all") {
    const since = new Date(Date.now() - ANNOUNCEMENT_COOLDOWN_MS).toISOString();
    const { count: recent, error: recentError } = await admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("type", "event_announcement")
      .eq("payload->>event_id", eventId)
      .eq("payload->>mode", "all")
      .gte("created_at", since);
    if (recentError) {
      console.error("enqueueAnnouncement (Limit):", recentError);
      return { count: 0, error: "Mailversand konnte nicht gestartet werden." };
    }
    if ((recent ?? 0) > 0) {
      return {
        count: 0,
        error: "Für dieses Event ging in den letzten 24 Stunden bereits eine Mail an alle Mitglieder raus.",
      };
    }
  }

  const { emails, error } = await resolveRecipients(target);
  if (error) return { count: 0, error };
  if (emails.length === 0) return { count: 0, error: "Keine Empfänger gefunden." };

  const payload = {
    event_id: eventId,
    event: toEventCore(row),
    mode: target.mode,
    recipients: emails,
    sent_count: 0,
    requested_by: requestedBy,
  };
  // Sperre prüfen und eintragen in einer Transaktion (zwei gleichzeitige Klicks → nur eine Rundmail).
  const { data: queuedId, error: rpcError } = await admin.rpc("enqueue_event_announcement", {
    p_event_id: eventId,
    p_payload: payload,
    p_cooldown_seconds: Math.round(ANNOUNCEMENT_COOLDOWN_MS / 1000),
  });
  let insertError = rpcError;
  if (rpcError?.code === "PGRST202") {
    // Funktion fehlt noch (Migration 20261009140000 nicht ausgeführt): direkt eintragen.
    ({ error: insertError } = await admin.from("notification_events").insert({ type: "event_announcement", payload }));
  } else if (!rpcError && !queuedId) {
    return {
      count: 0,
      error: "Für dieses Event ging in den letzten 24 Stunden bereits eine Mail an alle Mitglieder raus.",
    };
  }
  if (insertError) {
    console.error("enqueueAnnouncement:", insertError);
    return { count: 0, error: "Mailversand konnte nicht gestartet werden." };
  }
  return { count: emails.length, error: "" };
}
