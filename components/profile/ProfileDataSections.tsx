"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Landmark, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadField, ReadSection } from "@/components/kit/ReadSection";
import { updateProfile } from "@/app/(intranet)/profile/actions";
import { maskIban } from "@/components/profile/profile-format";

export type ProfileContactData = {
  vorname: string;
  nachname: string;
  email: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  mobil: string;
  iban: string;
  bic: string;
};

/**
 * Persönliche Daten und Bankverbindung: erst Lesesicht (ReadSection), der Stift öffnet
 * das Formular des jeweiligen Abschnitts. Gespeichert wird über dieselbe Server Action
 * wie bisher (updateProfile, gleiche Prüfung inkl. IBAN/BIC). Die Action schreibt immer
 * alle Felder, deshalb trägt jedes Formular die Werte des anderen Abschnitts unverändert
 * als versteckte Felder mit.
 */
export function ProfileDataSections({ profile }: { profile: ProfileContactData }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <PersonalSection profile={profile} />
      <BankSection profile={profile} />
    </div>
  );
}

function PersonalSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id, "Persönliche Daten gespeichert.");
  const name = `${profile.vorname} ${profile.nachname}`.trim();
  const streetLine = `${profile.strasse} ${profile.hausnummer}`.trim();
  const cityLine = `${profile.plz} ${profile.ort}`.trim();

  return (
    <div id={id}>
      {editor.editing ? (
        <EditCard title="Persönliche Daten" Icon={UserRound}>
          <EditForm editor={editor}>
            <input type="hidden" name="iban" value={profile.iban} />
            <input type="hidden" name="bic" value={profile.bic} />
            <div className="grid grid-cols-[1fr_6.5rem] gap-3 sm:gap-4">
              <Field id={`${id}-strasse`} label="Straße">
                <Input id={`${id}-strasse`} name="strasse" defaultValue={profile.strasse} autoComplete="address-line1" autoFocus />
              </Field>
              <Field id={`${id}-hausnummer`} label="Hausnr.">
                <Input id={`${id}-hausnummer`} name="hausnummer" defaultValue={profile.hausnummer} />
              </Field>
            </div>
            <div className="grid grid-cols-[6.5rem_1fr] gap-3 sm:gap-4">
              <Field id={`${id}-plz`} label="PLZ">
                <Input id={`${id}-plz`} name="plz" defaultValue={profile.plz} autoComplete="postal-code" inputMode="numeric" />
              </Field>
              <Field id={`${id}-ort`} label="Ort">
                <Input id={`${id}-ort`} name="ort" defaultValue={profile.ort} autoComplete="address-level2" />
              </Field>
            </div>
            <Field id={`${id}-mobil`} label="Handynummer">
              <Input id={`${id}-mobil`} name="mobil" type="tel" defaultValue={profile.mobil} autoComplete="tel" />
            </Field>
            <p className="text-xs text-muted-foreground">Name und E-Mail ändert der Vorstand.</p>
          </EditForm>
        </EditCard>
      ) : (
        <ReadSection title="Persönliche Daten" Icon={UserRound} onEdit={editor.open}>
          <ReadField label="Name" value={name} />
          <ReadField label="E-Mail" value={profile.email} />
          <ReadField
            label="Anschrift"
            value={
              streetLine || cityLine ? (
                <>
                  {streetLine && <span className="block">{streetLine}</span>}
                  {cityLine && <span className="block">{cityLine}</span>}
                </>
              ) : null
            }
          />
          <ReadField label="Handynummer" value={profile.mobil} />
        </ReadSection>
      )}
    </div>
  );
}

function BankSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id, "Bankverbindung gespeichert.");

  return (
    <div id={id}>
      {editor.editing ? (
        <EditCard title="Bankverbindung" Icon={Landmark}>
          <EditForm editor={editor}>
            <input type="hidden" name="strasse" value={profile.strasse} />
            <input type="hidden" name="hausnummer" value={profile.hausnummer} />
            <input type="hidden" name="plz" value={profile.plz} />
            <input type="hidden" name="ort" value={profile.ort} />
            <input type="hidden" name="mobil" value={profile.mobil} />
            <Field id={`${id}-iban`} label="IBAN">
              <Input
                id={`${id}-iban`}
                name="iban"
                defaultValue={profile.iban}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="font-mono tracking-wide"
              />
            </Field>
            <Field id={`${id}-bic`} label="BIC">
              <Input
                id={`${id}-bic`}
                name="bic"
                defaultValue={profile.bic}
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-wide"
              />
            </Field>
          </EditForm>
        </EditCard>
      ) : (
        // Nur die letzten 4 Stellen der IBAN zeigen.
        <ReadSection title="Bankverbindung" Icon={Landmark} onEdit={editor.open}>
          <ReadField label="IBAN" value={profile.iban ? maskIban(profile.iban) : null} mono />
          <ReadField label="BIC" value={profile.bic} />
        </ReadSection>
      )}
    </div>
  );
}

/** Rahmen des geöffneten Formulars, gleicher Kopf wie ReadSection (dort ist der Inhalt fest eine Liste). */
function EditCard({ title, Icon, children }: { title: string; Icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 flex min-h-6 items-center gap-2 text-base leading-tight font-bold tracking-[-0.02em]">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

type SectionEditor = ReturnType<typeof useSectionEditor>;

function useSectionEditor(anchorId: string, successMessage: string) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  // Nach Abbrechen/Speichern bekommt der Stift den Fokus zurück, statt ihn zu verlieren.
  const [refocus, setRefocus] = useState(false);

  useEffect(() => {
    if (editing || !refocus) return;
    document.getElementById(anchorId)?.querySelector<HTMLElement>('button[aria-label$="bearbeiten"]')?.focus();
  }, [editing, refocus, anchorId]);

  function open() {
    setError("");
    setEditing(true);
  }

  function close() {
    setError("");
    setRefocus(true);
    setEditing(false);
  }

  function cancel() {
    if (!pending) close();
  }

  // Eigener Submit statt <form action>: React setzt Formulare nach einer Action sonst
  // zurück, und bei einem Prüffehler wären die Eingaben weg.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await updateProfile({ success: false, error: "" }, formData);
        if (result.success) {
          toast.success(successMessage);
          close();
        } else {
          setError(result.error || "Speichern hat nicht geklappt.");
        }
      } catch {
        setError("Speichern hat nicht geklappt. Bitte versuch es noch einmal.");
      }
    });
  }

  return { editing, error, pending, open, cancel, submit };
}

function EditForm({ editor, children }: { editor: SectionEditor; children: ReactNode }) {
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      editor.cancel();
    }
  }

  return (
    <form
      onSubmit={editor.submit}
      onKeyDown={onKeyDown}
      noValidate
      data-reveal="fade"
      style={{ "--reveal-delay": "0s" } as CSSProperties}
      className="space-y-4"
    >
      {children}
      {editor.error && (
        <p role="alert" className="text-sm text-destructive">
          {editor.error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={editor.cancel} disabled={editor.pending}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={editor.pending}>
          {editor.pending ? "Speichern…" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
