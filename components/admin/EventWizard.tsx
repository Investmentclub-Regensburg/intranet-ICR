"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlignLeft,
  ArrowRight,
  AtSign,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  ImageIcon,
  ImagePlus,
  Mail,
  MailX,
  MapPin,
  MapPinOff,
  Sun,
  Trash2,
  Type,
  User,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogClose } from "@/components/ui/dialog";
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
import { IconButton } from "@/components/kit/IconButton";
import {
  PickTile,
  WizardDialog,
  WizardNav,
  WizardProgress,
  WizardStep,
  WizardLayout,
  WizardPreview,
  WizardSummary,
  useWizard,
  type WizardRow,
} from "@/components/kit/Wizard";
import { EventCard } from "@/components/events/EventCard";
import { createEvent } from "@/app/(intranet)/events/actions";
import { eventPath, formatEventDate, formatTimeRange, type AnnouncementTarget } from "@/lib/events";
import { RecipientEmailsInput } from "./AnnouncementRecipients";
import { ShareLinkButton } from "./ShareLinkButton";
import {
  EMPTY_EVENT_FORM,
  EVENT_IMAGE_ACCEPT,
  checkEventImage,
  eventFields,
  removeUploadedEventImage,
  todayInBerlin,
  uploadEventImage,
  validateEventForm,
  type EventFormState,
} from "./event-form-shared";

// Neue Veranstaltung als Wizard (Muster Tenant-Dashboard, terminarten): pro Schritt eine
// Frage, Auswahl springt selbst weiter, Zusammenfassung wächst links mit, am Ende die
// Vorschau so, wie Mitglieder die Veranstaltung sehen. Gespeichert wird mit derselben
// Action (createEvent), derselben Prüfung und demselben Bild-Upload wie im Formular.

const STEPS = [
  { key: "title", label: "Titel", Icon: Type },
  { key: "date", label: "Datum", Icon: CalendarDays },
  { key: "time", label: "Uhrzeit", Icon: Clock },
  { key: "location", label: "Ort", Icon: MapPin },
  { key: "organizer", label: "Veranstalter", Icon: User },
  { key: "description", label: "Beschreibung", Icon: AlignLeft },
  { key: "image", label: "Bild", Icon: ImageIcon },
  { key: "registration", label: "Anmeldung", Icon: Users },
  { key: "mail", label: "Rundmail", Icon: Mail },
  { key: "preview", label: "Vorschau", Icon: Eye },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
type MailMode = "" | "none" | "all" | "custom";
type Created = { id: string; title: string; announced: number; announceError: string };

export function EventWizard({
  open,
  onOpenChange,
  memberCount,
  canCustomMail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberCount: number;
  /** Mails an einzelne Adressen nur für den Vorstand (wie bisher). */
  canCustomMail: boolean;
}) {
  const router = useRouter();
  const wizard = useWizard(STEPS);
  const [form, setForm] = useState<EventFormState>(EMPTY_EVENT_FORM);
  const [timeMode, setTimeMode] = useState<"" | "allday" | "timed">("");
  const [organizerMode, setOrganizerMode] = useState<"" | "icr" | "other">("");
  const [otherOrganizer, setOtherOrganizer] = useState("");
  const [registration, setRegistration] = useState<"" | "ja" | "nein">("");
  const [mailMode, setMailMode] = useState<MailMode>("");
  const [emails, setEmails] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [stepError, setStepError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const announce: AnnouncementTarget | null =
    mailMode === "all" ? { mode: "all" } : mailMode === "custom" ? { mode: "custom", emails } : null;
  const announceCount = mailMode === "all" ? memberCount : mailMode === "custom" ? emails.length : 0;

  const dirty =
    !created &&
    (form.title.trim() !== "" ||
      form.eventDate !== "" ||
      form.location.trim() !== "" ||
      form.description.trim() !== "" ||
      !!imageFile);

  const done = (key: StepKey) => wizard.completed.includes(key);

  function goTo(key: StepKey) {
    setStepError("");
    wizard.goTo(key);
  }

  function back() {
    setStepError("");
    wizard.back();
  }

  /** Schritt prüfen und abhaken. */
  function next(key: StepKey = wizard.step) {
    const error = checkStep(key);
    setStepError(error);
    if (error) return;
    wizard.complete(key);
  }

  /** Auswahl-Antworten springen selbst weiter (kurz stehen lassen, dann weiter). */
  function autoNext(key: StepKey) {
    setStepError("");
    wizard.advance(key);
  }

  function checkStep(key: StepKey): string {
    switch (key) {
      case "title":
        if (!form.title.trim()) return "Bitte einen Titel eingeben.";
        return "";
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.eventDate)) return "Bitte ein Datum wählen.";
        return "";
      case "time":
        if (timeMode === "allday") return "";
        if (!form.eventTime) return "Bitte den Beginn eintragen oder „Ganztägig“ wählen.";
        if (form.endTime && form.endTime === form.eventTime) return "Endzeit muss nach der Startzeit liegen.";
        return "";
      case "organizer":
        if (organizerMode === "other" && !otherOrganizer.trim()) return "Bitte den Veranstalter eintragen.";
        if (!organizerMode && !otherOrganizer.trim()) return "Bitte „ICR“ wählen oder einen Veranstalter eintragen.";
        return "";
      case "registration":
        return registration ? "" : "Bitte wählen.";
      case "mail":
        if (!mailMode) return "Bitte wählen.";
        if (mailMode === "custom" && emails.length === 0) return "Bitte mindestens eine Adresse hinzufügen.";
        return "";
      default:
        return "";
    }
  }

  /** Enter in einem Feld: nie absenden, sondern Schritt abschließen. */
  const enterNext = (key: StepKey) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next(key);
    }
  };

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = checkEventImage(file);
    if (error) {
      setStepError(error);
      e.target.value = "";
      return;
    }
    setStepError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCreate() {
    const error = validateEventForm(form, announce);
    if (error) {
      setStepError(error);
      return;
    }
    if (announce?.mode === "all") {
      setConfirmOpen(true);
      return;
    }
    submit();
  }

  function submit() {
    setConfirmOpen(false);
    setStepError("");
    startTransition(async () => {
      let imagePath: string | null = null;
      if (imageFile) {
        const upload = await uploadEventImage(imageFile);
        if (upload.error || !upload.path) {
          setStepError(upload.error);
          return;
        }
        imagePath = upload.path;
      }

      const result = await createEvent({ ...eventFields(form), image_path: imagePath, announce });
      if (result.error || !result.id) {
        if (imagePath) await removeUploadedEventImage(imagePath);
        setStepError(result.error || "Veranstaltung konnte nicht angelegt werden.");
        return;
      }

      if (result.announceError) toast.error(`Angelegt, aber die Mail ging nicht raus: ${result.announceError}`);
      else toast.success("Veranstaltung angelegt.");
      setCreated({
        id: result.id,
        title: form.title.trim(),
        announced: result.announced,
        announceError: result.announceError,
      });
      router.refresh();
    });
  }

  // Zusammenfassung: eine Zeile je beantworteter Frage.
  const rows: WizardRow<StepKey>[] = [];
  if (done("title")) rows.push({ key: "title", label: "Titel", Icon: Type, value: form.title.trim() });
  if (done("date"))
    rows.push({ key: "date", label: "Datum", Icon: CalendarDays, value: formatEventDate(form.eventDate) });
  if (done("time"))
    rows.push({
      key: "time",
      label: "Uhrzeit",
      Icon: Clock,
      value: timeMode === "allday" ? "Ganztägig" : formatTimeRange(form.eventTime, form.endTime || null),
    });
  if (done("location"))
    rows.push({ key: "location", label: "Ort", Icon: MapPin, value: form.location.trim() || "Ohne Ort" });
  if (done("organizer"))
    rows.push({ key: "organizer", label: "Veranstalter", Icon: User, value: form.organizer || "ICR" });
  if (done("description"))
    rows.push({
      key: "description",
      label: "Beschreibung",
      Icon: AlignLeft,
      value: form.description.trim() || "Ohne Beschreibung",
    });
  if (done("image"))
    rows.push({ key: "image", label: "Bild", Icon: ImageIcon, value: imageFile ? imageFile.name : "Ohne Bild" });
  if (done("registration"))
    rows.push({
      key: "registration",
      label: "Anmeldung",
      Icon: Users,
      value: form.requiresRegistration ? "Mit Anmeldung" : "Ohne Anmeldung",
    });
  if (done("mail"))
    rows.push({
      key: "mail",
      label: "Rundmail",
      Icon: Mail,
      value:
        mailMode === "all"
          ? `Alle Mitglieder (${memberCount})`
          : mailMode === "custom"
            ? `${emails.length} ${emails.length === 1 ? "Adresse" : "Adressen"}`
            : "Niemand",
    });

  const stepProps = (key: StepKey) => ({
    stepKey: key,
    active: wizard.step === key,
    direction: wizard.direction,
    // Platz für das Schließen-X oben rechts
    className: "[&>h2]:pr-10",
  });
  const dateInPast = !!form.eventDate && form.eventDate < todayInBerlin();
  const endNextDay = !!form.endTime && !!form.eventTime && form.endTime < form.eventTime;
  const errorLine = stepError ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {stepError}
    </p>
  ) : null;

  return (
    <>
      <WizardDialog open={open} onOpenChange={onOpenChange} title="Neue Veranstaltung" dirty={dirty || isPending}>
        <DialogClose asChild>
          <IconButton label="Schließen" className="absolute top-3 right-3 z-10">
            <X />
          </IconButton>
        </DialogClose>

        {created ? (
          <CreatedView created={created} onDone={() => onOpenChange(false)} />
        ) : (
          <form noValidate onSubmit={(e) => e.preventDefault()}>
            <WizardLayout
              className="min-h-[30rem]"
              aside={
                <>
                  <p className="eyebrow">Neue Veranstaltung</p>
                  <WizardProgress count={wizard.count} index={wizard.index} label={STEPS[wizard.index].label} />
                  <WizardSummary
                    rows={rows}
                    activeKey={wizard.step}
                    onSelect={goTo}
                    className="-mx-3 hidden md:block"
                  />
                </>
              }
            >
              <fieldset disabled={isPending} className="min-w-0">
                <WizardStep {...stepProps("title")} title="Wie heißt die Veranstaltung?">
                  <Input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    onKeyDown={enterNext("title")}
                    placeholder="z. B. Semestereröffnung"
                    maxLength={200}
                    aria-label="Titel"
                    autoFocus
                    className="h-12 text-base"
                  />
                  {errorLine}
                  <WizardNav>
                    <NextButton onClick={() => next("title")} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("date")} title="An welchem Tag?">
                  <Input
                    type="date"
                    value={form.eventDate}
                    onChange={(e) => set("eventDate", e.target.value)}
                    onKeyDown={enterNext("date")}
                    aria-label="Datum"
                    className="h-12 w-full text-base sm:w-64"
                  />
                  {dateInPast && <Hint>Das Datum liegt in der Vergangenheit.</Hint>}
                  {errorLine}
                  <WizardNav onBack={back}>
                    <NextButton onClick={() => next("date")} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("time")} title="Um wie viel Uhr?">
                  <PickTile
                    name="ev-time-mode"
                    value="allday"
                    checked={timeMode === "allday"}
                    onChange={() => {
                      setTimeMode("allday");
                      setForm((f) => ({ ...f, eventTime: "", endTime: "" }));
                      autoNext("time");
                    }}
                    Icon={Sun}
                    label="Ganztägig"
                    hint="ohne Uhrzeit"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz-start">Beginn</Label>
                      <Input
                        id="wiz-start"
                        type="time"
                        value={form.eventTime}
                        onChange={(e) => {
                          setTimeMode(e.target.value ? "timed" : "");
                          setForm((f) => ({ ...f, eventTime: e.target.value, endTime: e.target.value ? f.endTime : "" }));
                        }}
                        onKeyDown={enterNext("time")}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz-end">
                        Ende <span className="font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="wiz-end"
                        type="time"
                        value={form.endTime}
                        disabled={!form.eventTime}
                        onChange={(e) => set("endTime", e.target.value)}
                        onKeyDown={enterNext("time")}
                        className="h-11"
                      />
                    </div>
                  </div>
                  {endNextDay && <Hint>Ende liegt vor dem Beginn: Die Veranstaltung endet am Folgetag.</Hint>}
                  {errorLine}
                  <WizardNav onBack={back}>
                    <NextButton onClick={() => next("time")} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("location")} title="Wo findet sie statt?">
                  <Input
                    value={form.location}
                    onChange={(e) => set("location", e.target.value)}
                    onKeyDown={enterNext("location")}
                    placeholder="z. B. H24, Uni Regensburg"
                    aria-label="Ort"
                    className="h-12 text-base"
                  />
                  {errorLine}
                  <WizardNav onBack={back}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        set("location", "");
                        next("location");
                      }}
                    >
                      <MapPinOff aria-hidden />
                      Ohne Ort
                    </Button>
                    <NextButton onClick={() => next("location")} disabled={!form.location.trim()} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("organizer")} title="Wer veranstaltet?">
                  <PickTile
                    name="ev-organizer"
                    value="icr"
                    checked={organizerMode === "icr"}
                    onChange={() => {
                      setOrganizerMode("icr");
                      set("organizer", "ICR");
                      autoNext("organizer");
                    }}
                    Icon={User}
                    label="ICR"
                    hint="Investment Club Regensburg"
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-organizer">Oder ein anderer Veranstalter</Label>
                    <Input
                      id="wiz-organizer"
                      value={otherOrganizer}
                      onChange={(e) => {
                        setOtherOrganizer(e.target.value);
                        setOrganizerMode(e.target.value.trim() ? "other" : "");
                        set("organizer", e.target.value);
                      }}
                      onKeyDown={enterNext("organizer")}
                      placeholder="z. B. Ressort Marketing, Partnerfirma"
                      className="h-11"
                    />
                  </div>
                  {errorLine}
                  <WizardNav onBack={back}>
                    <NextButton onClick={() => next("organizer")} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("description")} title="Worum geht es?">
                  <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={7}
                    maxLength={5000}
                    aria-label="Beschreibung"
                    placeholder="Wer spricht, was erwartet die Teilnehmenden, was sollten sie mitbringen …"
                    className="flex w-full rounded-lg border border-input bg-card px-3 py-2.5 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 md:text-sm"
                  />
                  <WizardNav onBack={back}>
                    <SkipButton
                      onClick={() => {
                        set("description", "");
                        next("description");
                      }}
                    />
                    <NextButton onClick={() => next("description")} disabled={!form.description.trim()} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("image")} title="Ein Bild dazu?">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={EVENT_IMAGE_ACCEPT}
                    onChange={handleFile}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                  />
                  {imagePreview ? (
                    <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Vorschau einer lokalen Datei (Blob-URL) */}
                      <img src={imagePreview} alt="" className="aspect-[1.91/1] w-full object-cover" />
                      <div className="absolute top-2 right-2 flex gap-1 rounded-xs bg-card/90 p-0.5 shadow-soft backdrop-blur">
                        <IconButton label="Anderes Bild wählen" onClick={() => fileInputRef.current?.click()}>
                          <ImagePlus />
                        </IconButton>
                        <IconButton label="Bild entfernen" variant="danger" onClick={clearImage}>
                          <Trash2 />
                        </IconButton>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:bg-accent/50 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <ImagePlus className="size-7" aria-hidden />
                      <span className="text-sm font-semibold">Bild auswählen</span>
                      <span className="text-xs">JPG, PNG, GIF oder WebP, max. 5 MB, Querformat</span>
                    </button>
                  )}
                  {errorLine}
                  <WizardNav onBack={back}>
                    <SkipButton
                      onClick={() => {
                        clearImage();
                        next("image");
                      }}
                    />
                    <NextButton onClick={() => next("image")} disabled={!imageFile} />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("registration")} title="Sollen sich Mitglieder anmelden?">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PickTile
                      name="ev-registration"
                      value="ja"
                      checked={registration === "ja"}
                      onChange={() => {
                        setRegistration("ja");
                        set("requiresRegistration", true);
                        autoNext("registration");
                      }}
                      Icon={UserCheck}
                      label="Ja, mit Anmeldung"
                      hint="Mitglieder melden sich im Intranet an"
                    />
                    <PickTile
                      name="ev-registration"
                      value="nein"
                      checked={registration === "nein"}
                      onChange={() => {
                        setRegistration("nein");
                        set("requiresRegistration", false);
                        autoNext("registration");
                      }}
                      Icon={UserX}
                      label="Nein"
                      hint="einfach vorbeikommen"
                    />
                  </div>
                  {errorLine}
                  <WizardNav onBack={back}>
                    <span />
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("mail")} title="Wer bekommt eine Rundmail?">
                  <div className="grid gap-3">
                    <PickTile
                      name="ev-mail"
                      value="none"
                      checked={mailMode === "none"}
                      onChange={() => {
                        setMailMode("none");
                        autoNext("mail");
                      }}
                      Icon={MailX}
                      label="Niemand"
                      hint="Die Veranstaltung erscheint nur im Intranet"
                    />
                    <PickTile
                      name="ev-mail"
                      value="all"
                      checked={mailMode === "all"}
                      onChange={() => {
                        setMailMode("all");
                        autoNext("mail");
                      }}
                      Icon={Users}
                      label="Alle Mitglieder"
                      hint={`${memberCount} Empfänger, ohne Alumni und Ausgetretene`}
                    />
                    {canCustomMail && (
                      <PickTile
                        name="ev-mail"
                        value="custom"
                        checked={mailMode === "custom"}
                        onChange={() => setMailMode("custom")}
                        Icon={AtSign}
                        label="Einzelne Adressen"
                        hint="z. B. zum Testen an dich selbst"
                      />
                    )}
                  </div>
                  {mailMode === "custom" && <RecipientEmailsInput emails={emails} onChange={setEmails} autoFocus />}
                  {errorLine}
                  <WizardNav onBack={back}>
                    {mailMode === "custom" ? <NextButton onClick={() => next("mail")} /> : <span />}
                  </WizardNav>
                </WizardStep>

                <WizardStep {...stepProps("preview")} title="Alles richtig?">
                  <WizardPreview label="So sehen Mitglieder die Veranstaltung">
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
                        image_url: imagePreview,
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
                  </WizardPreview>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    {announce ? <Mail className="size-4 text-primary" aria-hidden /> : <MailX className="size-4" aria-hidden />}
                    {announce
                      ? `Rundmail an ${announceCount} Empfänger direkt nach dem Anlegen.`
                      : "Keine Rundmail."}
                  </p>
                  <WizardSummary rows={rows} onSelect={goTo} className="-mx-3 md:hidden" />
                  {errorLine}
                  <WizardNav onBack={back}>
                    <Button type="button" size="lg" onClick={handleCreate} disabled={isPending}>
                      {isPending
                        ? "Wird angelegt…"
                        : announce && announceCount > 0
                          ? `Anlegen & an ${announceCount} senden`
                          : "Anlegen"}
                    </Button>
                  </WizardNav>
                </WizardStep>
              </fieldset>
            </WizardLayout>
          </form>
        )}
      </WizardDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mail an alle Mitglieder senden?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Veranstaltung wird angelegt und {memberCount} Mitglieder bekommen sofort eine E-Mail. Das lässt
              sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={submit}>Anlegen & senden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" size="lg" onClick={onClick} disabled={disabled}>
      Weiter
      <ArrowRight aria-hidden />
    </Button>
  );
}

function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onClick}>
      Überspringen
    </Button>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** Abschluss: Veranstaltung ist angelegt, nächste Schritte als Knöpfe. */
function CreatedView({ created, onDone }: { created: Created; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-14 text-center sm:px-12">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-tint text-primary">
        <CheckCircle2 className="size-7" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-[-0.03em]">„{created.title}“ ist angelegt.</h2>
        {created.announced > 0 && (
          <p className="text-sm text-muted-foreground">
            Die Mail an {created.announced} Empfänger wird im Hintergrund verschickt.
          </p>
        )}
        {created.announceError && <p className="text-sm text-destructive">Mail: {created.announceError}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <ShareLinkButton eventId={created.id} title={created.title} variant="outline" />
        <Button variant="outline" asChild>
          <Link href={eventPath(created.id)}>
            <Eye aria-hidden />
            Ansehen
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/admin/events/${created.id}`}>Verwalten</Link>
        </Button>
        <Button onClick={onDone}>Fertig</Button>
      </div>
    </div>
  );
}
