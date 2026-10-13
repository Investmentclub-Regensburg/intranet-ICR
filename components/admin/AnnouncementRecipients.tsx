"use client";

import { useState } from "react";
import { AtSign, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PickTile } from "@/components/kit/Wizard";
import { MAX_CUSTOM_RECIPIENTS, isValidEmail, type AnnouncementTarget } from "@/lib/events";

type Props = {
  value: AnnouncementTarget;
  onChange: (value: AnnouncementTarget) => void;
  /** Anzahl aktiver Mitglieder (ohne Alumni / Ausgetretene). */
  memberCount: number;
  /** Einzelne Adressen nur für den Vorstand (die Server Action prüft das ebenfalls). */
  canCustom?: boolean;
  disabled?: boolean;
};

/** Empfängerauswahl für Event-Mails: alle aktiven Mitglieder oder einzelne Adressen. */
export function AnnouncementRecipients({ value, onChange, memberCount, canCustom = true, disabled }: Props) {
  const emails = value.mode === "custom" ? value.emails : [];

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="sr-only">Empfänger</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <PickTile
          name="announce-mode"
          value="all"
          checked={value.mode === "all"}
          onChange={() => onChange({ mode: "all" })}
          Icon={Users}
          label="Alle Mitglieder"
          hint={`${memberCount} Empfänger, ohne Alumni und Ausgetretene`}
        />
        {canCustom && (
          <PickTile
            name="announce-mode"
            value="custom"
            checked={value.mode === "custom"}
            onChange={() => onChange({ mode: "custom", emails })}
            Icon={AtSign}
            label="Einzelne Adressen"
            hint="z. B. zum Testen an dich selbst"
          />
        )}
      </div>

      {value.mode === "custom" && (
        <RecipientEmailsInput
          emails={emails}
          onChange={(next) => onChange({ mode: "custom", emails: next })}
          disabled={disabled}
        />
      )}
    </fieldset>
  );
}

/** Eingabe einzelner Adressen als Chips (Enter, Komma, Einfügen mehrerer Adressen). */
export function RecipientEmailsInput({
  emails,
  onChange,
  disabled,
  autoFocus,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");

  function addFromDraft(raw = draft): boolean {
    const parts = raw
      .split(/[\s,;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return true;

    const invalid = parts.filter((p) => !isValidEmail(p));
    const next = [...new Set([...emails, ...parts.filter((p) => isValidEmail(p))])];
    if (next.length > MAX_CUSTOM_RECIPIENTS) {
      setDraftError(`Maximal ${MAX_CUSTOM_RECIPIENTS} Adressen.`);
      return false;
    }
    onChange(next);
    setDraft(invalid.join(" "));
    setDraftError(invalid.length ? `Ungültig: ${invalid.join(", ")}` : "");
    return invalid.length === 0;
  }

  function remove(email: string) {
    onChange(emails.filter((e) => e !== email));
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex gap-2">
        <Input
          type="email"
          inputMode="email"
          value={draft}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder="name@beispiel.de"
          aria-label="E-Mail-Adresse hinzufügen"
          aria-invalid={!!draftError}
          className="h-10 bg-card"
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";") {
              e.preventDefault();
              addFromDraft();
            } else if (e.key === "Backspace" && !draft && emails.length) {
              remove(emails[emails.length - 1]);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              addFromDraft(text);
            }
          }}
          onBlur={() => addFromDraft()}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={disabled || !draft.trim()}
          onClick={() => addFromDraft()}
        >
          Hinzufügen
        </Button>
      </div>
      {draftError && <p className="text-xs text-destructive">{draftError}</p>}
      {emails.length === 0 ? (
        <p className="text-xs text-muted-foreground">Adresse eingeben und mit Enter bestätigen.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Empfänger">
          {emails.map((email) => (
            <li
              key={email}
              className="flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pr-1 pl-2.5 text-xs"
            >
              {email}
              <button
                type="button"
                onClick={() => remove(email)}
                disabled={disabled}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`${email} entfernen`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function recipientCount(target: AnnouncementTarget, memberCount: number): number {
  return target.mode === "all" ? memberCount : target.emails.length;
}
