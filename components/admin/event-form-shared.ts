// Gemeinsame Logik für Event-Formular (Bearbeiten) und Event-Wizard (Anlegen):
// dieselbe Prüfung, derselbe Bild-Upload (direkt in den Bucket event-images,
// Pfad `<userId>/<uuid>.<ext>`), dieselben Felder für createEvent/updateEvent.
// Nur im Browser verwenden (Supabase-Browser-Client).

import { createClient } from "@/utils/supabase/client";
import type { EventFormInput } from "@/app/(intranet)/events/actions";
import {
  EVENT_IMAGE_BUCKET,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_TYPES,
  MAX_EVENT_DAYS,
  shortTime,
  type AnnouncementTarget,
  type EventCore,
} from "@/lib/events";

export type EventFormState = {
  title: string;
  organizer: string;
  location: string;
  eventDate: string;
  /** Letzter Tag bei mehrtägigen Events, "" = eintägig. */
  endDate: string;
  eventTime: string;
  endTime: string;
  description: string;
  requiresRegistration: boolean;
};

export const EMPTY_EVENT_FORM: EventFormState = {
  title: "",
  organizer: "",
  location: "",
  eventDate: "",
  endDate: "",
  eventTime: "",
  endTime: "",
  description: "",
  requiresRegistration: false,
};

export function formFromEvent(event: EventCore): EventFormState {
  return {
    title: event.title,
    organizer: event.organizer ?? "",
    location: event.location ?? "",
    eventDate: event.event_date,
    endDate: event.end_date ?? "",
    eventTime: shortTime(event.event_time),
    endTime: shortTime(event.end_time),
    description: event.description ?? "",
    requiresRegistration: event.requires_registration,
  };
}

export function todayInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Prüfung vor dem Absenden (die Server Action prüft zusätzlich selbst). "" = in Ordnung. */
export function validateEventForm(form: EventFormState, announce: AnnouncementTarget | null): string {
  if (!form.title.trim()) return "Titel ist Pflicht.";
  if (!form.eventDate) return "Bitte ein Datum wählen.";
  const dateError = validateEndDate(form);
  if (dateError) return dateError;
  if (form.endTime && !form.eventTime) return "Für eine Endzeit bitte auch eine Startzeit angeben.";
  if (!isFormMultiDay(form) && form.endTime && form.endTime === form.eventTime)
    return "Endzeit muss nach der Startzeit liegen.";
  if (announce?.mode === "custom" && announce.emails.length === 0)
    return "Bitte mindestens eine E-Mail-Adresse hinzufügen oder die Mail deaktivieren.";
  return "";
}

/** Mehrtägig, wenn ein Enddatum nach dem Starttag gewählt ist. */
export function isFormMultiDay(form: Pick<EventFormState, "eventDate" | "endDate">): boolean {
  return !!form.endDate && !!form.eventDate && form.endDate > form.eventDate;
}

/** Enddatum prüfen (gleicher Tag ist erlaubt und zählt als eintägig). "" = in Ordnung. */
export function validateEndDate(form: Pick<EventFormState, "eventDate" | "endDate">): string {
  if (!form.endDate || !form.eventDate) return "";
  if (form.endDate < form.eventDate) return "Das Enddatum darf nicht vor dem Startdatum liegen.";
  if (Date.parse(form.endDate) - Date.parse(form.eventDate) > MAX_EVENT_DAYS * 24 * 60 * 60 * 1000)
    return `Ein Event darf höchstens ${MAX_EVENT_DAYS} Tage nach dem Start enden.`;
  return "";
}

/** Felder für createEvent/updateEvent. */
export function eventFields(form: EventFormState): EventFormInput {
  return {
    title: form.title,
    description: form.description,
    event_date: form.eventDate,
    end_date: isFormMultiDay(form) ? form.endDate : "",
    event_time: form.eventTime,
    end_time: form.endTime,
    location: form.location,
    organizer: form.organizer,
    requires_registration: form.requiresRegistration,
  };
}

/** Typ und Größe einer gewählten Bilddatei prüfen. "" = in Ordnung. */
export function checkEventImage(file: File): string {
  if (!EVENT_IMAGE_TYPES[file.type]) return "Nur Bilder (JPG, PNG, GIF, WebP) erlaubt.";
  if (file.size > EVENT_IMAGE_MAX_BYTES) return "Bild darf maximal 5 MB groß sein.";
  return "";
}

export const EVENT_IMAGE_ACCEPT = Object.keys(EVENT_IMAGE_TYPES).join(",");

/** Bild in den eigenen Upload-Ordner laden. path = null und error gesetzt bei Fehler. */
export async function uploadEventImage(file: File): Promise<{ path: string | null; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { path: null, error: "Sitzung abgelaufen. Bitte neu anmelden." };

  const path = `${user.id}/${crypto.randomUUID()}.${EVENT_IMAGE_TYPES[file.type]}`;
  const { error } = await supabase.storage
    .from(EVENT_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) return { path: null, error: "Bild konnte nicht hochgeladen werden." };
  return { path, error: "" };
}

/** Hochgeladenes Bild wieder entfernen (wenn das Speichern danach scheitert). */
export async function removeUploadedEventImage(path: string): Promise<void> {
  await createClient().storage.from(EVENT_IMAGE_BUCKET).remove([path]);
}
