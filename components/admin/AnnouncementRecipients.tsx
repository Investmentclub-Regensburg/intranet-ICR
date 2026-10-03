"use client";

import { useState } from "react";
import { Users, AtSign, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_CUSTOM_RECIPIENTS, isValidEmail, type AnnouncementTarget } from "@/lib/events";

type Props = {
  value: AnnouncementTarget;
  onChange: (value: AnnouncementTarget) => void;
  /** Anzahl aktiver Mitglieder (ohne Alumni / Ausgetretene). */
  memberCount: number;
  disabled?: boolean;
};

/** Empfängerauswahl für Event-Mails: alle aktiven Mitglieder oder einzelne Adressen. */
export function AnnouncementRecipients({ value, onChange, memberCount, disabled }: Props) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const emails = value.mode === "custom" ? value.emails : [];

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
    onChange({ mode: "custom", emails: next });
    setDraft(invalid.join(" "));
    setDraftError(invalid.length ? `Ungültig: ${invalid.join(", ")}` : "");
    return invalid.length === 0;
  }

  function remove(email: string) {
    onChange({ mode: "custom", emails: emails.filter((e) => e !== email) });
  }

  const option = (active: boolean) =>
    cn(
      "flex flex-1 items-start gap-3 rounded-lg border p-3 text-left transition-colors",
      active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
      disabled && "pointer-events-none opacity-60"
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label="Empfänger">
        <button
          type="button"
          role="radio"
          aria-checked={value.mode === "all"}
          className={option(value.mode === "all")}
          onClick={() => onChange({ mode: "all" })}
        >
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-medium">Alle Mitglieder</span>
            <span className="block text-xs text-muted-foreground">
              {memberCount} Empfänger · ohne Alumni & Ausgetretene
            </span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.mode === "custom"}
          className={option(value.mode === "custom")}
          onClick={() => onChange({ mode: "custom", emails })}
        >
          <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block text-sm font-medium">Nur bestimmte Adressen</span>
            <span className="block text-xs text-muted-foreground">z. B. zum Testen an dich selbst</span>
          </span>
        </button>
      </div>

      {value.mode === "custom" && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex gap-2">
            <Input
              type="email"
              inputMode="email"
              value={draft}
              disabled={disabled}
              placeholder="name@beispiel.de"
              aria-label="E-Mail-Adresse hinzufügen"
              aria-invalid={!!draftError}
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
            <Button type="button" variant="outline" disabled={disabled || !draft.trim()} onClick={() => addFromDraft()}>
              Hinzufügen
            </Button>
          </div>
          {draftError && <p className="text-xs text-destructive">{draftError}</p>}
          {emails.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Adresse eingeben und mit Enter bestätigen. Mehrere Adressen können auch eingefügt werden.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5" aria-label="Empfänger">
              {emails.map((email) => (
                <li
                  key={email}
                  className="flex items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => remove(email)}
                    disabled={disabled}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`${email} entfernen`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function recipientCount(target: AnnouncementTarget, memberCount: number): number {
  return target.mode === "all" ? memberCount : target.emails.length;
}
