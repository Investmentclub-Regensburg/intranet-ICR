// Gemeinsame Logik für Event-Formular (Bearbeiten) und Event-Wizard (Anlegen):
// dieselbe Prüfung, derselbe Bild-Upload (über die App, POST /api/event-image, Pfad im Bucket
// event-images `<userId>/<uuid>.<ext>`), dieselben Felder für createEvent/updateEvent.
// Nur im Browser verwenden. Der Browser spricht nie direkt mit Supabase.

import {
  removeUploadedEventImage as removeUploadedEventImageAction,
  type EventFormInput,
} from "@/app/(intranet)/events/actions";
import {
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_TYPES,
  MAX_EVENT_DAYS,
  MAX_PARTICIPANTS_LIMIT,
  capacityBelowRegistrationsMessage,
  parseMaxParticipants,
  shortTime,
  type AnnouncementTarget,
  type EventCapacity,
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
  /** Max. Teilnehmende als Eingabe, "" = unbegrenzt. */
  maxParticipants: string;
  registrationClosed: boolean;
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
  maxParticipants: "",
  registrationClosed: false,
};

export function formFromEvent(event: EventCore & EventCapacity): EventFormState {
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
    maxParticipants: event.max_participants === null ? "" : String(event.max_participants),
    registrationClosed: event.registration_closed,
  };
}

/**
 * Teilnehmerzahl prüfen. minimum = bestehende Anmeldungen (beim Bearbeiten; die Zahl darf nicht
 * darunter liegen). "" = in Ordnung.
 */
export function validateMaxParticipants(form: Pick<EventFormState, "requiresRegistration" | "maxParticipants">, minimum = 0): string {
  if (!form.requiresRegistration) return "";
  const max = parseMaxParticipants(form.maxParticipants);
  if (max === undefined) return `Teilnehmerzahl bitte als ganze Zahl von 1 bis ${MAX_PARTICIPANTS_LIMIT} angeben.`;
  if (max !== null && max < minimum) return capacityBelowRegistrationsMessage(minimum);
  return "";
}

export function todayInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Prüfung vor dem Absenden (die Server Action prüft zusätzlich selbst). "" = in Ordnung. */
export function validateEventForm(
  form: EventFormState,
  announce: AnnouncementTarget | null,
  registrationCount = 0
): string {
  if (!form.title.trim()) return "Titel ist Pflicht.";
  const capacityError = validateMaxParticipants(form, registrationCount);
  if (capacityError) return capacityError;
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
    max_participants: form.requiresRegistration ? (parseMaxParticipants(form.maxParticipants) ?? null) : null,
    registration_closed: form.requiresRegistration && form.registrationClosed,
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
  const body = new FormData();
  body.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/event-image", { method: "POST", body });
  } catch {
    return { path: null, error: "Bild konnte nicht hochgeladen werden." };
  }
  const data = (await res.json().catch(() => null)) as { path?: unknown; error?: unknown } | null;
  if (res.ok && typeof data?.path === "string") return { path: data.path, error: "" };
  if (typeof data?.error === "string" && data.error) return { path: null, error: data.error };
  // Ohne JSON-Antwort, z. B. wenn die Plattform die Anfrage wegen ihrer Größe vorher abweist.
  if (res.status === 413) return { path: null, error: "Bild ist zu groß. Bitte ein kleineres Bild wählen." };
  return { path: null, error: "Bild konnte nicht hochgeladen werden." };
}

/** Hochgeladenes Bild wieder entfernen (wenn das Speichern danach scheitert). */
export async function removeUploadedEventImage(path: string): Promise<void> {
  await removeUploadedEventImageAction(path);
}
