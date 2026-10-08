"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Landmark, Lock, Pencil, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconButton } from "@/components/kit/IconButton";
import { updateProfile } from "@/app/(intranet)/profile/actions";
import { ReadField, SectionCard } from "@/components/profile/ReadField";
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
 * Persönliche Daten und Bankverbindung: erst Lesesicht, der Stift öffnet das Formular
 * des jeweiligen Abschnitts. Gespeichert wird über dieselbe Server Action wie bisher
 * (updateProfile, gleiche Prüfung inkl. IBAN/BIC). Die Action schreibt immer alle
 * Felder, deshalb trägt jedes Formular die Werte des anderen Abschnitts unverändert
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

const LOCKED_HINT = "Ändert der Vorstand";

function PersonalSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor("Persönliche Daten gespeichert.");
  const name = `${profile.vorname} ${profile.nachname}`.trim();
  const streetLine = `${profile.strasse} ${profile.hausnummer}`.trim();
  const cityLine = `${profile.plz} ${profile.ort}`.trim();

  return (
    <SectionCard
      labelledBy={`${id}-title`}
      title="Persönliche Daten"
      icon={<UserRound aria-hidden />}
      action={
        !editor.editing && (
          <IconButton autoFocus={editor.refocus} label="Persönliche Daten bearbeiten" variant="outline" onClick={editor.open}>
            <Pencil />
          </IconButton>
        )
      }
    >
      {editor.editing ? (
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
        </EditForm>
      ) : (
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <ReadField label={<LockedLabel>Name</LockedLabel>} value={name} />
          <ReadField label={<LockedLabel>E-Mail</LockedLabel>} value={profile.email} />
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
        </dl>
      )}
    </SectionCard>
  );
}

function BankSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor("Bankverbindung gespeichert.");

  return (
    <SectionCard
      labelledBy={`${id}-title`}
      title="Bankverbindung"
      icon={<Landmark aria-hidden />}
      action={
        !editor.editing && (
          <IconButton autoFocus={editor.refocus} label="Bankverbindung bearbeiten" variant="outline" onClick={editor.open}>
            <Pencil />
          </IconButton>
        )
      }
    >
      {editor.editing ? (
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
      ) : (
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ReadField
            label="IBAN"
            value={profile.iban ? <span className="tabular-nums">{maskIban(profile.iban)}</span> : null}
          />
          <ReadField label="BIC" value={profile.bic} />
        </dl>
      )}
    </SectionCard>
  );
}

function LockedLabel({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <span title={LOCKED_HINT} className="inline-flex">
        <Lock className="size-3" aria-hidden />
        <span className="sr-only">({LOCKED_HINT})</span>
      </span>
    </>
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

function useSectionEditor(successMessage: string) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  // Nach Abbrechen/Speichern bekommt der Stift den Fokus zurück (autoFocus beim erneuten Einblenden).
  const [refocus, setRefocus] = useState(false);

  function open() {
    setError("");
    setEditing(true);
  }

  function cancel() {
    if (pending) return;
    setError("");
    setRefocus(true);
    setEditing(false);
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
          setRefocus(true);
          setEditing(false);
        } else {
          setError(result.error || "Speichern hat nicht geklappt.");
        }
      } catch {
        setError("Speichern hat nicht geklappt. Bitte versuch es noch einmal.");
      }
    });
  }

  return { editing, error, pending, open, cancel, submit, refocus };
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
      className="animate-in fade-in slide-in-from-top-1 space-y-4 duration-300 motion-reduce:animate-none"
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
