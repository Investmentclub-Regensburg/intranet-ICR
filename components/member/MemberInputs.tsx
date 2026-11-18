"use client";

/**
 * Eingabefelder für Mitgliederdaten (Registrierung, Profil, Korrektur durch den Vorstand): Handy mit
 * Länderauswahl, Land der Anschrift, IBAN in Viererblöcken, Fehler und Hinweise am Feld, Haken beim
 * Speichern. Nur Eingabehilfen (lib/member-rules-client.ts): Gültig ist, was der Server sagt.
 */
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { countryCodes, DEFAULT_COUNTRY } from "@/lib/country-codes";
import { formatiereHandyEingabe, handyPlatzhalter, ibanInViererbloecken } from "@/lib/member-rules-client";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

export const SELECT_CLASS =
  "flex h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 aria-invalid:border-destructive md:text-sm";

/** Länder alphabetisch nach Namen, Deutschland zuerst (Standard). */
const LAENDER_NACH_NAME = [...countryCodes].sort((a, b) =>
  a.code === DEFAULT_COUNTRY ? -1 : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name, "de")
);

/** Fehler direkt unter dem Feld (kurz, Du-Form). */
export function FeldFehler({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

/** Nicht blockierender Hinweis am Feld. */
export function FeldHinweis({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export type HandyWert = { land: string; nummer: string };

/**
 * Handy: Länderauswahl (ISO-Code, Standard DE, Tastatursuche der Auswahl) + Nummer. Beim Verlassen des Felds
 * und beim Einfügen wird formatiert; „+43 …“, „0043 …“ stellen die Auswahl um, die führende 0 fällt weg.
 * Nicht beim Tippen: Die Formatierung schreibt die ganze Eingabe neu, der Cursor spränge sonst ans Ende.
 */
export function HandyEingabe({
  id,
  wert,
  onChange,
  landName = "handyLand",
  nummerName = "handynummer",
  fehler,
  required,
  className,
  autoComplete = "tel-national",
}: {
  id: string;
  wert: HandyWert;
  onChange: (wert: HandyWert) => void;
  landName?: string;
  nummerName?: string;
  fehler?: string;
  required?: boolean;
  className?: string;
  autoComplete?: string;
}) {
  const fehlerId = `${id}-fehler`;
  const formatieren = (nummer: string, land: string) => {
    const f = formatiereHandyEingabe(nummer, land);
    onChange({ land: f.land, nummer: f.nummer });
  };
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <select
          id={`${id}-land`}
          name={landName}
          value={wert.land}
          onChange={(e) => onChange({ ...wert, land: e.target.value })}
          className={cn(SELECT_CLASS, "w-[6.5rem] shrink-0")}
          aria-label="Ländervorwahl"
        >
          {countryCodes.map(({ code, dialCode }) => (
            <option key={code} value={code}>
              {dialCode} {code}
            </option>
          ))}
        </select>
        <Input
          id={id}
          name={nummerName}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          required={required}
          placeholder={handyPlatzhalter(wert.land)}
          value={wert.nummer}
          onChange={(e) => onChange({ ...wert, nummer: e.target.value })}
          onBlur={(e) => formatieren(e.target.value, wert.land)}
          onPaste={(e) => {
            const input = e.currentTarget;
            // Nach dem Einfügen (Wert steht dann im Feld) einmal formatieren.
            window.setTimeout(() => formatieren(input.value, wert.land), 0);
          }}
          aria-invalid={fehler ? true : undefined}
          aria-describedby={fehler ? fehlerId : undefined}
          className="min-w-0 flex-1"
        />
      </div>
      <FeldFehler id={fehlerId}>{fehler}</FeldFehler>
    </div>
  );
}

/** Land der Anschrift (Name, Wert = ISO-Code), Deutschland vorausgewählt. */
export function LandAuswahl({
  id,
  name = "land",
  wert,
  onChange,
  fehler,
  className,
}: {
  id: string;
  name?: string;
  wert: string;
  onChange: (land: string) => void;
  fehler?: string;
  className?: string;
}) {
  const fehlerId = `${id}-fehler`;
  return (
    <div className="space-y-1.5">
      <select
        id={id}
        name={name}
        value={wert || DEFAULT_COUNTRY}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="country"
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? fehlerId : undefined}
        className={cn(SELECT_CLASS, className)}
      >
        {LAENDER_NACH_NAME.map(({ code, name: landName }) => (
          <option key={code} value={code}>
            {landName}
          </option>
        ))}
      </select>
      <FeldFehler id={fehlerId}>{fehler}</FeldFehler>
    </div>
  );
}

/**
 * Wert mit Formatierung beim Tippen setzen und den Cursor hinter demselben Zeichen halten: gezählt werden
 * die Buchstaben/Ziffern vor dem Cursor, nicht die eingefügten Leerzeichen.
 */
export function viererblockAenderung(e: ChangeEvent<HTMLInputElement>, setze: (wert: string) => void) {
  const input = e.target;
  const roh = input.value;
  const cursor = input.selectionStart ?? roh.length;
  const zeichenVorCursor = roh.slice(0, cursor).replace(/[^A-Za-z0-9]/g, "").length;
  const formatiert = ibanInViererbloecken(roh);
  setze(formatiert);
  window.requestAnimationFrame(() => {
    if (document.activeElement !== input) return;
    let pos = 0;
    let gezaehlt = 0;
    while (pos < formatiert.length && gezaehlt < zeichenVorCursor) {
      if (/[A-Z0-9]/.test(formatiert[pos])) gezaehlt++;
      pos++;
    }
    input.setSelectionRange(pos, pos);
  });
}

/** IBAN-Feld in Viererblöcken (kontrolliert). */
export function IbanEingabe({
  id,
  name = "iban",
  wert,
  onChange,
  fehler,
  placeholder = "DE89 3704 0044 0532 0130 00",
  onBlur,
  describedBy,
  required,
  inputRef,
}: {
  id: string;
  name?: string;
  wert: string;
  onChange: (wert: string) => void;
  fehler?: string;
  placeholder?: string;
  onBlur?: () => void;
  describedBy?: string;
  required?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const fehlerId = `${id}-fehler`;
  return (
    <div className="space-y-1.5">
      <Input
        ref={inputRef}
        id={id}
        name={name}
        value={wert}
        onChange={(e) => viererblockAenderung(e, onChange)}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        aria-invalid={fehler ? true : undefined}
        aria-describedby={[fehler ? fehlerId : null, describedBy].filter(Boolean).join(" ") || undefined}
        className="font-mono tracking-wide"
      />
      <FeldFehler id={fehlerId}>{fehler}</FeldFehler>
    </div>
  );
}

/**
 * Nach dem Speichern: Haken zeichnet sich, Leiste füllt sich, danach `onFertig` (Formular/Fenster schließen).
 * Bei „Bewegung reduzieren“ ohne Animation, kurz stehen lassen.
 */
export function GespeichertHaken({ text = "Gespeichert", onFertig }: { text?: string; onFertig: () => void }) {
  const reduziert = useReducedMotionSafe();
  const [voll, setVoll] = useState(false);
  const fertig = useRef(onFertig);
  useEffect(() => {
    fertig.current = onFertig;
  }, [onFertig]);
  useEffect(() => {
    const start = window.requestAnimationFrame(() => setVoll(true));
    const ende = window.setTimeout(() => fertig.current(), reduziert ? 700 : 1100);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(ende);
    };
  }, [reduziert]);
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-primary">
        {reduziert ? (
          <Check className="size-6" aria-hidden />
        ) : (
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={voll ? 0 : 1}
              style={{ transition: "stroke-dashoffset 450ms ease-out" }}
            />
          </svg>
        )}
      </span>
      <p className="text-sm font-medium">{text}</p>
      <span className="h-1 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full bg-primary"
          style={{
            width: voll || reduziert ? "100%" : "0%",
            transition: reduziert ? undefined : "width 900ms ease-in-out",
          }}
        />
      </span>
    </div>
  );
}
