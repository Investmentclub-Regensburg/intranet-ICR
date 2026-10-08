"use server";

import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireRole, requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isSafeId } from "@/lib/validation";
import {
  EVENT_IMAGE_BUCKET,
  MAX_CUSTOM_RECIPIENTS,
  eventEndTimestamp,
  eventStartTimestamp,
  isValidEmail,
  type AnnouncementTarget,
  type EventCore,
} from "@/lib/events";

export type EventListItem = EventCore & {
  created_at: string;
  registration_count: number;
  registered_user_ids: string[];
};

export type MyEventItem = Pick<EventCore, "id" | "title" | "event_date" | "event_time" | "end_time" | "location">;

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
const IMAGE_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return { error: auth.error };
  return { userId: auth.user.id };
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
    event_time: str(e.event_time),
    end_time: str(e.end_time),
    location: str(e.location),
    organizer: str(e.organizer),
    image_url: str(e.image_url),
    requires_registration: !!e.requires_registration,
  };
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

const fetchEvents = unstable_cache(
  async (): Promise<EventListItem[]> => {
    const admin = createServiceClient();
    const [{ data: events, error }, { data: regs }] = await Promise.all([
      admin
        .from("events")
        .select(
          "id, title, description, event_date, event_time, end_time, location, organizer, image_url, requires_registration, created_at"
        )
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: true }),
      admin.from("event_registrations").select("event_id, user_id").range(0, 49999),
    ]);
    if (error || !events) return [];

    const byEvent = new Map<string, string[]>();
    for (const r of regs ?? []) {
      const list = byEvent.get(r.event_id as string) ?? [];
      list.push(r.user_id as string);
      byEvent.set(r.event_id as string, list);
    }

    return events.map((e) => {
      const ids = byEvent.get(e.id as string) ?? [];
      return {
        ...toEventCore(e),
        created_at: String(e.created_at ?? ""),
        registration_count: ids.length,
        registered_user_ids: ids,
      };
    });
  },
  ["events-list-v2"],
  { revalidate: 60, tags: [EVENTS_TAG] }
);

/** Alle Events, aufsteigend nach Beginn. Nur serverseitig verwenden (enthält User-IDs der Anmeldungen). */
export async function getEvents(): Promise<EventListItem[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];
  return fetchEvents();
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
  const pick = (e: EventListItem): MyEventItem => ({
    id: e.id,
    title: e.title,
    event_date: e.event_date,
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
  announcements: EventAnnouncement[];
} | null> {
  const auth = await requireAdmin();
  if ("error" in auth) return null;
  if (!isSafeId(eventId)) return null;

  const event = await getEvent(eventId);
  if (!event) return null;

  const admin = createServiceClient();
  const [{ data: regs }, { data: notifications }] = await Promise.all([
    admin
      .from("event_registrations")
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

  const userIds = (regs ?? []).map((r) => r.user_id as string).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select('user_id, "Vorname", "Nachname", "Studiengang / Fach", "Rolle"')
        .in("user_id", userIds)
    : { data: [] as Record<string, unknown>[] };

  const profileByUser = new Map<string, Record<string, unknown>>();
  for (const p of profiles ?? []) profileByUser.set(String(p.user_id), p);

  const participants: EventParticipant[] = (regs ?? []).map((r) => {
    const p = profileByUser.get(r.user_id as string) ?? {};
    return {
      user_id: r.user_id as string,
      vorname: String(p["Vorname"] ?? "").trim(),
      nachname: String(p["Nachname"] ?? "").trim(),
      studiengang: String(p["Studiengang / Fach"] ?? "").trim(),
      rolle: String(p["Rolle"] ?? "").trim(),
      registered_at: String(r.created_at ?? ""),
    };
  });

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

  return { event, participants, announcements };
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
  event_time: string;
  end_time: string;
  location: string;
  organizer: string;
  requires_registration: boolean;
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
  const eventTime = input.event_time?.trim().slice(0, 5) ?? "";
  const endTime = input.end_time?.trim().slice(0, 5) ?? "";

  if (!title) return { error: "Titel ist Pflicht." };
  if (title.length > 200) return { error: "Titel ist zu lang (max. 200 Zeichen)." };
  if (!DATE_RE.test(eventDate) || Number.isNaN(Date.parse(eventDate))) return { error: "Bitte ein gültiges Datum wählen." };
  if (eventTime && !TIME_RE.test(eventTime)) return { error: "Ungültige Startzeit." };
  if (endTime && !TIME_RE.test(endTime)) return { error: "Ungültige Endzeit." };
  if (endTime && !eventTime) return { error: "Für eine Endzeit bitte auch eine Startzeit angeben." };
  if (endTime && endTime === eventTime) return { error: "Endzeit muss nach der Startzeit liegen." };
  if ((input.description ?? "").length > 5000) return { error: "Beschreibung ist zu lang (max. 5000 Zeichen)." };

  return {
    error: "",
    row: {
      title,
      description: input.description?.trim() || null,
      event_date: eventDate,
      event_time: eventTime || null,
      end_time: endTime || null,
      location: input.location?.trim() || null,
      organizer: input.organizer?.trim() || null,
      requires_registration: !!input.requires_registration,
    },
  };
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

  const parsed = parseEventFields(input);
  if (!parsed.row) return fail(parsed.error);

  let imageUrl: string | null = null;
  if (input.image_path) {
    imageUrl = await imageUrlFromPath(input.image_path, auth.userId);
    if (!imageUrl) return fail("Ungültiges Bild.");
  }

  if (input.announce?.mode === "custom") {
    const check = normalizeCustomEmails(input.announce.emails);
    if (check.error) return fail(check.error);
  }

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
  const { data: current } = await supabase.from("events").select("image_url").eq("id", eventId).maybeSingle();
  if (!current) return { error: "Event nicht gefunden." };
  const oldImageUrl = (current.image_url as string | null) ?? null;

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

export async function toggleRegistration(
  eventId: string,
  isRegistered: boolean
): Promise<{ error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: auth.error };
  const user = auth.user;
  if (!isSafeId(eventId)) return { error: "Event nicht gefunden." };

  const supabase = await getCachedSupabase();
  if (isRegistered) {
    const { error } = await supabase
      .from("event_registrations")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", user.id);
    if (error) return { error: "Abmeldung fehlgeschlagen." };
  } else {
    const { error } = await supabase
      .from("event_registrations")
      .insert({ event_id: eventId, user_id: user.id });
    if (error?.code === "23505") return { error: "Du bist bereits angemeldet." };
    if (error) return { error: "Anmeldung nicht möglich (Event vorbei oder ohne Anmeldung)." };
  }

  invalidateEvents();
  return { error: "" };
}

export async function sendEventAnnouncement(
  eventId: string,
  target: AnnouncementTarget
): Promise<{ count: number; error: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { count: 0, error: auth.error };
  if (!isSafeId(eventId)) return { count: 0, error: "Event nicht gefunden." };
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
    if (String(p["Status"] ?? "").trim().toLowerCase() === "cancelled") continue;
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
    .select("id, title, description, event_date, event_time, end_time, location, organizer, image_url, requires_registration")
    .eq("id", eventId)
    .maybeSingle();
  if (evError || !row) return { count: 0, error: "Event nicht gefunden." };

  const { emails, error } = await resolveRecipients(target);
  if (error) return { count: 0, error };
  if (emails.length === 0) return { count: 0, error: "Keine Empfänger gefunden." };

  const { error: insertError } = await admin.from("notification_events").insert({
    type: "event_announcement",
    payload: {
      event_id: eventId,
      event: toEventCore(row),
      mode: target.mode,
      recipients: emails,
      sent_count: 0,
      requested_by: requestedBy,
    },
  });
  if (insertError) {
    console.error("enqueueAnnouncement:", insertError);
    return { count: 0, error: "Mailversand konnte nicht gestartet werden." };
  }
  return { count: emails.length, error: "" };
}
