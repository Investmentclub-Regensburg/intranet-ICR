"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Mail, MailX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/utils/supabase/client";
import { createEvent, updateEvent, type UpdateEventInput } from "@/app/(intranet)/events/actions";
import { EventCard } from "@/components/events/EventCard";
import { ShareEventButton, eventUrl } from "@/components/events/ShareEventButton";
import {
  EVENT_IMAGE_BUCKET,
  EVENT_IMAGE_MAX_BYTES,
  EVENT_IMAGE_TYPES,
  eventPath,
  shortTime,
  type AnnouncementTarget,
  type EventCore,
} from "@/lib/events";
import { AnnouncementRecipients, recipientCount } from "./AnnouncementRecipients";

type Props = {
  /** Anzahl aktiver Mitglieder für die Rundmail (nur beim Anlegen). */
  memberCount?: number;
  /** Gesetzt = Bearbeiten-Modus für dieses Event. */
  event?: EventCore;
};

type Created = { id: string; title: string; announced: number; announceError: string };

const EMPTY = {
  title: "",
  organizer: "",
  location: "",
  eventDate: "",
  eventTime: "",
  endTime: "",
  description: "",
  requiresRegistration: false,
};

const textareaClass =
  "border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]";

function formFromEvent(event: EventCore): typeof EMPTY {
  return {
    title: event.title,
    organizer: event.organizer ?? "",
    location: event.location ?? "",
    eventDate: event.event_date,
    eventTime: shortTime(event.event_time),
    endTime: shortTime(event.end_time),
    description: event.description ?? "",
    requiresRegistration: event.requires_registration,
  };
}

function todayInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Formular zum Anlegen und Bearbeiten von Events (mit Live-Vorschau). */
export function EventForm({ memberCount = 0, event }: Props) {
  const isEdit = !!event;
  const router = useRouter();
  const [form, setForm] = useState(() => (event ? formFromEvent(event) : EMPTY));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  /** Bereits gespeichertes Bild (nur Bearbeiten); null = entfernt bzw. keins. */
  const [existingImage, setExistingImage] = useState<string | null>(event?.image_url ?? null);
  const [announce, setAnnounce] = useState<AnnouncementTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const endBeforeStart = !!form.endTime && !!form.eventTime && form.endTime < form.eventTime;
  const dateInPast = !!form.eventDate && form.eventDate < todayInBerlin();
  const announceCount = announce ? recipientCount(announce, memberCount) : 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!EVENT_IMAGE_TYPES[file.type]) {
      toast.error("Nur Bilder (JPG, PNG, GIF, WebP) erlaubt.");
      e.target.value = "";
      return;
    }
    if (file.size > EVENT_IMAGE_MAX_BYTES) {
      toast.error("Bild darf maximal 5 MB groß sein.");
      e.target.value = "";
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    setExistingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validate(): string {
    if (!form.title.trim()) return "Titel ist Pflicht.";
    if (!form.eventDate) return "Bitte ein Datum wählen.";
    if (form.endTime && !form.eventTime) return "Für eine Endzeit bitte auch eine Startzeit angeben.";
    if (form.endTime && form.endTime === form.eventTime) return "Endzeit muss nach der Startzeit liegen.";
    if (announce?.mode === "custom" && announce.emails.length === 0)
      return "Bitte mindestens eine E-Mail-Adresse hinzufügen oder die Mail deaktivieren.";
    return "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    // Rundmail an alle nur nach Bestätigung.
    if (announce?.mode === "all") {
      setConfirmOpen(true);
      return;
    }
    submit();
  }

  function submit() {
    setConfirmOpen(false);
    startTransition(async () => {
      const supabase = createClient();
      let imagePath: string | null = null;

      if (imageFile) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Sitzung abgelaufen. Bitte neu anmelden.");
          return;
        }
        imagePath = `${user.id}/${crypto.randomUUID()}.${EVENT_IMAGE_TYPES[imageFile.type]}`;
        const { error: uploadError } = await supabase.storage
          .from(EVENT_IMAGE_BUCKET)
          .upload(imagePath, imageFile, { contentType: imageFile.type, cacheControl: "31536000", upsert: false });
        if (uploadError) {
          toast.error("Bild konnte nicht hochgeladen werden.");
          return;
        }
      }

      const fields = {
        title: form.title,
        description: form.description,
        event_date: form.eventDate,
        event_time: form.eventTime,
        end_time: form.endTime,
        location: form.location,
        organizer: form.organizer,
        requires_registration: form.requiresRegistration,
      };

      if (event) {
        const image: UpdateEventInput["image"] = imagePath
          ? { path: imagePath }
          : existingImage
            ? "keep"
            : "remove";
        const { error } = await updateEvent(event.id, { ...fields, image });
        if (error) {
          if (imagePath) await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([imagePath]);
          toast.error(error);
          return;
        }
        toast.success("Änderungen gespeichert.");
        router.push(`/admin/events/${event.id}`);
        router.refresh();
        return;
      }

      const result = await createEvent({ ...fields, image_path: imagePath, announce });

      if (result.error || !result.id) {
        if (imagePath) await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([imagePath]);
        toast.error(result.error || "Event konnte nicht erstellt werden.");
        return;
      }

      if (result.announceError) toast.error(`Event erstellt, aber Mail fehlgeschlagen: ${result.announceError}`);
      else toast.success("Event erstellt.");

      setCreated({ id: result.id, title: form.title.trim(), announced: result.announced, announceError: result.announceError });
      setForm(EMPTY);
      setAnnounce(null);
      clearImage();
    });
  }

  return (
    <div className="space-y-6">
      {created && (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-medium">„{created.title}“ ist online.</p>
              <p className="truncate text-xs text-muted-foreground">{eventUrl(created.id)}</p>
              {created.announced > 0 && (
                <p className="text-xs text-muted-foreground">
                  Mail an {created.announced} Empfänger wird im Hintergrund verschickt.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <ShareEventButton eventId={created.id} title={created.title} label />
            <Button variant="outline" size="sm" asChild>
              <Link href={eventPath(created.id)}>Ansehen</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
              Schließen
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          <fieldset className="space-y-4" disabled={isPending}>
            <legend className="mb-3 text-sm font-semibold">Basisdaten</legend>
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Titel *</Label>
              <Input
                id="ev-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="z. B. Semestereröffnung"
                maxLength={200}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-organizer">Veranstalter</Label>
                <Input
                  id="ev-organizer"
                  value={form.organizer}
                  onChange={(e) => set("organizer", e.target.value)}
                  placeholder="Standard: ICR"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-location">Ort</Label>
                <Input
                  id="ev-location"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="z. B. H24, Uni Regensburg"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4" disabled={isPending}>
            <legend className="mb-3 text-sm font-semibold">Datum & Uhrzeit</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-date">Datum *</Label>
                <Input
                  id="ev-date"
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => set("eventDate", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-time">Beginn</Label>
                <Input
                  id="ev-time"
                  type="time"
                  value={form.eventTime}
                  onChange={(e) => {
                    set("eventTime", e.target.value);
                    if (!e.target.value) set("endTime", "");
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end-time">Ende</Label>
                <Input
                  id="ev-end-time"
                  type="time"
                  value={form.endTime}
                  disabled={!form.eventTime}
                  onChange={(e) => set("endTime", e.target.value)}
                  aria-describedby="ev-time-hint"
                />
              </div>
            </div>
            <p id="ev-time-hint" className="text-xs text-muted-foreground">
              {dateInPast
                ? "Hinweis: Das Datum liegt in der Vergangenheit."
                : endBeforeStart
                  ? "Ende liegt vor dem Beginn – das Event endet am Folgetag."
                  : !form.eventTime
                    ? "Uhrzeiten sind optional. Ende ist erst nach dem Beginn wählbar."
                    : " "}
            </p>
          </fieldset>

          <fieldset className="space-y-4" disabled={isPending}>
            <legend className="mb-3 text-sm font-semibold">Details</legend>
            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Beschreibung</Label>
              <textarea
                id="ev-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Worum geht es, wer spricht, was sollte man mitbringen …"
                className={textareaClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-image">Bild</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" />
                  {imageFile || existingImage ? "Anderes Bild" : "Bild auswählen"}
                </Button>
                {(imageFile || existingImage) && (
                  <>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {imageFile ? imageFile.name : "Aktuelles Bild"}
                    </span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={clearImage} aria-label="Bild entfernen">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                id="ev-image"
                type="file"
                accept={Object.keys(EVENT_IMAGE_TYPES).join(",")}
                onChange={handleFileChange}
                className="sr-only"
              />
              <p className="text-xs text-muted-foreground">JPG, PNG, GIF oder WebP, max. 5 MB. Querformat (1.91:1) passt am besten.</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ev-reg"
                checked={form.requiresRegistration}
                onCheckedChange={(v) => set("requiresRegistration", v === true)}
              />
              <Label htmlFor="ev-reg" className="cursor-pointer text-sm font-normal">
                Anmeldung erforderlich (Mitglieder melden sich im Intranet an)
              </Label>
            </div>
          </fieldset>

          {!isEdit && (
            <fieldset className="space-y-3 rounded-lg border p-4" disabled={isPending} aria-label="Mitglieder per E-Mail informieren">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Mitglieder per E-Mail informieren</h3>
                  <p className="text-xs text-muted-foreground">
                    Optional: Mail mit Vorschau und Link zum Event.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={announce ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={!!announce}
                  onClick={() => setAnnounce(announce ? null : { mode: "custom", emails: [] })}
                >
                  {announce ? <MailX className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  {announce ? "Keine Mail senden" : "Mail senden"}
                </Button>
              </div>
              {announce && (
                <AnnouncementRecipients
                  value={announce}
                  onChange={setAnnounce}
                  memberCount={memberCount}
                  disabled={isPending}
                />
              )}
            </fieldset>
          )}

          {isEdit && event.requires_registration && !form.requiresRegistration && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              Die Anmeldung wird deaktiviert. Bestehende Anmeldungen bleiben gespeichert, sind für Mitglieder aber
              nicht mehr sichtbar.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending
                ? isEdit
                  ? "Wird gespeichert…"
                  : "Wird erstellt…"
                : isEdit
                  ? "Änderungen speichern"
                  : announce && announceCount > 0
                    ? `Event erstellen & an ${announceCount} senden`
                    : "Event erstellen"}
            </Button>
            {isEdit && (
              <Button type="button" variant="ghost" disabled={isPending} asChild>
                <Link href={`/admin/events/${event.id}`}>Abbrechen</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Live-Vorschau</p>
          <EventCard
            preview
            event={{
              title: form.title.trim(),
              description: form.description.trim() || null,
              event_date: form.eventDate,
              event_time: form.eventTime || null,
              end_time: form.endTime || null,
              location: form.location.trim() || null,
              organizer: form.organizer.trim() || null,
              image_url: imagePreview ?? existingImage,
              requires_registration: form.requiresRegistration,
            }}
            footer={
              form.requiresRegistration && (
                <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                  <span>0 Personen nehmen teil</span>
                  <Button size="sm" disabled>
                    Anmelden
                  </Button>
                </div>
              )
            }
          />
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mail an alle Mitglieder senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Event wird erstellt und {memberCount} Mitglieder bekommen sofort eine E-Mail. Das lässt sich
              nicht rückgängig machen. Tipp: Zum Testen erst „Nur bestimmte Adressen“ mit deiner eigenen Adresse
              wählen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={submit}>Erstellen & senden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
