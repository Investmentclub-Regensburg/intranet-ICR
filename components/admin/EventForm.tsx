"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/kit/IconButton";
import { updateEvent, type UpdateEventInput } from "@/app/(intranet)/events/actions";
import { EventCard } from "@/components/events/EventCard";
import type { EventCore } from "@/lib/events";
import { Switch } from "./bits";
import {
  EVENT_IMAGE_ACCEPT,
  checkEventImage,
  eventFields,
  formFromEvent,
  removeUploadedEventImage,
  todayInBerlin,
  uploadEventImage,
  validateEventForm,
  type EventFormState,
} from "./event-form-shared";

type Props = {
  /** Die Veranstaltung, die bearbeitet wird. Anlegen läuft über den EventWizard. */
  event: EventCore;
};

const textareaClass =
  "flex w-full rounded-xs border border-input bg-card px-3 py-2.5 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 md:text-sm";

/** Bearbeiten bleibt ein Formular (wer ändert, sucht ein Feld), mit Live-Vorschau. */
export function EventForm({ event }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<EventFormState>(() => formFromEvent(event));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  /** Bereits gespeichertes Bild; null = entfernt bzw. keins. */
  const [existingImage, setExistingImage] = useState<string | null>(event.image_url ?? null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const endBeforeStart = !!form.endTime && !!form.eventTime && form.endTime < form.eventTime;
  const dateInPast = !!form.eventDate && form.eventDate < todayInBerlin();
  const shownImage = imagePreview ?? existingImage;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const problem = checkEventImage(file);
    if (problem) {
      toast.error(problem);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateEventForm(form, null);
    setError(problem);
    if (problem) return;

    startTransition(async () => {
      let imagePath: string | null = null;
      if (imageFile) {
        const upload = await uploadEventImage(imageFile);
        if (upload.error || !upload.path) {
          setError(upload.error);
          return;
        }
        imagePath = upload.path;
      }

      const image: UpdateEventInput["image"] = imagePath ? { path: imagePath } : existingImage ? "keep" : "remove";
      const { error: saveError } = await updateEvent(event.id, { ...eventFields(form), image });
      if (saveError) {
        if (imagePath) await removeUploadedEventImage(imagePath);
        setError(saveError);
        return;
      }
      toast.success("Änderungen gespeichert.");
      router.push(`/admin/events/${event.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <fieldset className="min-w-0 space-y-5" disabled={isPending}>
        <Section title="Basisdaten">
          <Field label="Titel" htmlFor="ev-title">
            <Input
              id="ev-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="z. B. Semestereröffnung"
              maxLength={200}
              required
              className="h-11"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Veranstalter" htmlFor="ev-organizer">
              <Input
                id="ev-organizer"
                value={form.organizer}
                onChange={(e) => set("organizer", e.target.value)}
                placeholder="Standard: ICR"
                className="h-11"
              />
            </Field>
            <Field label="Ort" htmlFor="ev-location">
              <Input
                id="ev-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="z. B. H24, Uni Regensburg"
                className="h-11"
              />
            </Field>
          </div>
        </Section>

        <Section title="Datum und Uhrzeit">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Datum" htmlFor="ev-date">
              <Input
                id="ev-date"
                type="date"
                value={form.eventDate}
                onChange={(e) => set("eventDate", e.target.value)}
                required
                className="h-11"
              />
            </Field>
            <Field label="Beginn" htmlFor="ev-time">
              <Input
                id="ev-time"
                type="time"
                value={form.eventTime}
                onChange={(e) => {
                  set("eventTime", e.target.value);
                  if (!e.target.value) set("endTime", "");
                }}
                className="h-11"
              />
            </Field>
            <Field label="Ende" htmlFor="ev-end-time">
              <Input
                id="ev-end-time"
                type="time"
                value={form.endTime}
                disabled={!form.eventTime}
                onChange={(e) => set("endTime", e.target.value)}
                className="h-11"
              />
            </Field>
          </div>
          {(dateInPast || endBeforeStart || !form.eventTime) && (
            <p className="text-xs text-muted-foreground">
              {dateInPast
                ? "Das Datum liegt in der Vergangenheit."
                : endBeforeStart
                  ? "Ende liegt vor dem Beginn: Die Veranstaltung endet am Folgetag."
                  : "Ohne Beginn gilt die Veranstaltung als ganztägig."}
            </p>
          )}
        </Section>

        <Section title="Details">
          <Field label="Beschreibung" htmlFor="ev-desc">
            <textarea
              id="ev-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="Worum geht es, wer spricht, was sollte man mitbringen …"
              className={textareaClass}
            />
          </Field>

          <div className="space-y-1.5">
            <span className="text-sm font-semibold">Bild</span>
            <input
              ref={fileInputRef}
              id="ev-image"
              type="file"
              accept={EVENT_IMAGE_ACCEPT}
              onChange={handleFileChange}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
            {shownImage ? (
              <div className="flex items-center gap-3 rounded-xl border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase-Storage / Blob-Vorschau */}
                <img src={shownImage} alt="" className="aspect-[1.91/1] w-28 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {imageFile ? imageFile.name : "Aktuelles Bild"}
                </span>
                <IconButton label="Anderes Bild wählen" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus />
                </IconButton>
                <IconButton label="Bild entfernen" variant="danger" onClick={clearImage}>
                  <Trash2 />
                </IconButton>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus aria-hidden />
                Bild auswählen
              </Button>
            )}
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF oder WebP, max. 5 MB, Querformat.</p>
          </div>

          <Switch
            id="ev-reg"
            checked={form.requiresRegistration}
            onChange={(v) => set("requiresRegistration", v)}
            label="Mit Anmeldung"
            hint="Mitglieder melden sich im Intranet an."
          />
          {event.requires_registration && !form.requiresRegistration && (
            <p className="rounded-xs border border-primary/25 bg-brand-tint px-3 py-2 text-xs">
              Bestehende Anmeldungen bleiben gespeichert, sind für Mitglieder aber nicht mehr sichtbar.
            </p>
          )}
        </Section>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? "Wird gespeichert…" : "Änderungen speichern"}
          </Button>
          <Button type="button" variant="ghost" size="lg" disabled={isPending} asChild>
            <Link href={`/admin/events/${event.id}`}>Abbrechen</Link>
          </Button>
        </div>
      </fieldset>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Vorschau für Mitglieder
        </p>
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
            image_url: shownImage,
            requires_registration: form.requiresRegistration,
          }}
        />
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
