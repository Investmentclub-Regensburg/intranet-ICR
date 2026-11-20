"use client";

/**
 * Studiengang als Auswahl mit Suche (Registrierung, Profil, Vorstandsfenster, Abfrage „Stimmen deine Daten noch?“). Die Liste ist lang, deshalb
 * ein Eingabefeld, das beim Tippen filtert (Kurzname, Langform und Abkürzung finden denselben Eintrag, z. B. „BWL“
 * und „Betriebs…“). Nur bei „Sonstiges“ erscheint ein Textfeld, dessen Inhalt gespeichert wird.
 *
 * Bedienung nach dem üblichen Combobox-Muster (WAI-ARIA APG, „List autocomplete“): Fokus bleibt im Eingabefeld, die
 * aktive Option steht in `aria-activedescendant` und trägt `aria-selected`; Pfeiltasten wandern, Enter wählt, Esc
 * schließt nur die Liste. Die Trefferzahl wird angesagt. Nach „Sonstiges“ springt der Fokus ins Textfeld.
 *
 * Gesendet werden `name` (Name aus der Liste) und `freitextName` (nur bei „Sonstiges“). Gültig ist, was der Server
 * sagt (lib/studiengaenge.ts → pruefeStudiengang); im Browser meldet das Feld nur „aus der Liste wählen“.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FeldFehler } from "@/components/member/MemberInputs";
import { KEIN_STUDIUM, SONSTIGES, eindeutigerTreffer, studiengangLabel, sucheStudiengaenge } from "@/lib/studiengaenge";
import { cn } from "@/lib/utils";

export type StudiengangWert = { auswahl: string; freitext: string };

const AUS_LISTE = "Bitte wähl deinen Studiengang aus der Liste.";

export function StudiengangAuswahl({
  id,
  name = "studiengang",
  freitextName = "studiengangSonstiges",
  wert,
  onChange,
  fehler,
  fehlerFreitext,
  required,
  ohneKeinStudium = false,
  freitextLabel = "Dein Studiengang",
  fehlerSymbol = false,
  className,
}: {
  id: string;
  name?: string;
  freitextName?: string;
  wert: StudiengangWert;
  onChange: (wert: StudiengangWert) => void;
  /** Fehler zur Auswahl. */
  fehler?: string;
  /** Fehler zum Freitext bei „Sonstiges“ (steht am Textfeld). */
  fehlerFreitext?: string;
  required?: boolean;
  /** „Kein Studium“ ausblenden (Registrierung nach „Ja, ich studiere“). */
  ohneKeinStudium?: boolean;
  /** Beschriftung des Textfelds bei „Sonstiges“ (Vorstandsfenster: nicht „Dein …“). */
  freitextLabel?: string;
  /** Fehler mit Warnsymbol (FeldFehler `symbol`, Seite „Daten prüfen“). */
  fehlerSymbol?: boolean;
  className?: string;
}) {
  const listeId = useId();
  const ansageId = useId();
  const fehlerId = `${id}-fehler`;
  const freitextId = `${id}-sonstiges`;
  const freitextFehlerId = `${freitextId}-fehler`;
  const eingabe = useRef<HTMLInputElement>(null);
  const freitextFeld = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  /** Text beim Tippen; ohne laufende Suche zeigt das Feld die Auswahl. */
  const [suche, setSuche] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  /** Nach der Wahl von „Sonstiges“ einmal ins Textfeld springen. */
  const [zumFreitext, setZumFreitext] = useState(false);

  // „Kein Studium“ steht in der Auswahl als „Ich studiere nicht (mehr)“ (gespeichert wird der Name).
  const text = suche ?? studiengangLabel(wert.auswahl);
  const treffer = useMemo(
    () => sucheStudiengaenge(suche ?? "", { ohneKeinStudium }),
    [suche, ohneKeinStudium]
  );
  const trefferZahl = treffer.filter((s) => s.name !== SONSTIGES).length;

  // Browser-Prüfung (Wizard „Weiter“): Pflichtfeld ohne Auswahl → Hinweis „aus der Liste wählen“.
  useEffect(() => {
    eingabe.current?.setCustomValidity(required && !wert.auswahl ? AUS_LISTE : "");
  }, [required, wert.auswahl]);

  // Aktive Option sichtbar halten.
  useEffect(() => {
    if (!offen || aktiv < 0) return;
    liste.current?.querySelector<HTMLElement>(`[data-index="${aktiv}"]`)?.scrollIntoView({ block: "nearest" });
  }, [offen, aktiv]);

  // Fokus ins Textfeld, sobald es nach „Sonstiges“ da ist.
  useEffect(() => {
    if (!zumFreitext || wert.auswahl !== SONSTIGES) return;
    freitextFeld.current?.focus();
    const t = window.setTimeout(() => setZumFreitext(false), 0);
    return () => window.clearTimeout(t);
  }, [zumFreitext, wert.auswahl]);

  const waehle = (auswahl: string) => {
    // Bei „Sonstiges“ wandert der getippte Text ins Freitextfeld, wenn es noch leer ist.
    const getippt = (suche ?? "").trim();
    const freitext =
      auswahl === SONSTIGES ? wert.freitext || (getippt && getippt !== SONSTIGES ? getippt : "") : "";
    onChange({ auswahl, freitext });
    setSuche(null);
    setOffen(false);
    setAktiv(-1);
    if (auswahl === SONSTIGES) setZumFreitext(true);
  };

  const schliessen = () => {
    setOffen(false);
    setAktiv(-1);
    if (suche === null) return;
    // Beim Verlassen: eindeutige Eingabe („bwl“, „Betriebswirtschaftslehre“) übernehmen, sonst Text stehen lassen.
    const eindeutig = eindeutigerTreffer(suche, { ohneKeinStudium });
    if (eindeutig && eindeutig !== SONSTIGES) waehle(eindeutig);
    else if (!suche.trim()) setSuche(null);
  };

  const tasten = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!offen) {
        setOffen(true);
        setAktiv(0);
        return;
      }
      const n = treffer.length;
      if (n === 0) return;
      setAktiv((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter") {
      if (offen && aktiv >= 0 && treffer[aktiv]) {
        // Nicht zum nächsten Schritt springen: Enter wählt hier nur aus.
        e.preventDefault();
        e.stopPropagation();
        waehle(treffer[aktiv].name);
      }
    } else if (e.key === "Escape") {
      if (offen) {
        // Ein umgebendes Fenster bleibt offen, nur die Liste schließt.
        e.preventDefault();
        e.stopPropagation();
        setOffen(false);
        setAktiv(-1);
      }
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1.5">
        <div className="relative">
          <Input
            ref={eingabe}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={offen}
            aria-controls={listeId}
            aria-autocomplete="list"
            aria-activedescendant={offen && aktiv >= 0 ? `${listeId}-${aktiv}` : undefined}
            aria-invalid={fehler ? true : undefined}
            aria-describedby={fehler ? fehlerId : undefined}
            autoComplete="off"
            spellCheck={false}
            required={required}
            placeholder="Tippen oder auswählen, z. B. BWL"
            value={text}
            onChange={(e) => {
              setSuche(e.target.value);
              setOffen(true);
              setAktiv(e.target.value.trim() ? 0 : -1);
              if (wert.auswahl) onChange({ auswahl: "", freitext: "" });
            }}
            onFocus={() => setOffen(true)}
            onClick={() => setOffen(true)}
            onBlur={schliessen}
            onKeyDown={tasten}
            className="h-11 pr-10"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={offen ? "Liste schließen" : "Liste öffnen"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (offen) {
                setOffen(false);
              } else {
                setOffen(true);
                eingabe.current?.focus();
              }
            }}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
          >
            <ChevronDown className={cn("size-4 transition-transform", offen && "rotate-180")} aria-hidden />
          </button>
          {/* Immer im DOM, damit aria-controls auf ein vorhandenes Element zeigt; geschlossen per hidden. */}
          <ul
            ref={liste}
            id={listeId}
            role="listbox"
            aria-label="Studiengänge"
            hidden={!offen}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {offen &&
              treffer.map((s, i) => {
                const gewaehlt = s.name === wert.auswahl;
                return (
                  <li
                    key={s.name}
                    id={`${listeId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === aktiv}
                    // mousedown statt click: sonst verliert das Feld vorher den Fokus und die Liste schließt.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      waehle(s.name);
                    }}
                    onMouseMove={() => {
                      if (aktiv !== i) setAktiv(i);
                    }}
                    className={cn(
                      // Am Handy mindestens 44 px hoch (Touch), am Desktop kompakter.
                      "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm md:min-h-0 md:py-2",
                      // „Ich studiere nicht (mehr)“ oben angeheftet, auch beim Blättern sichtbar.
                      s.name === KEIN_STUDIUM &&
                        i === 0 &&
                        treffer.length > 1 &&
                        "sticky top-0 z-10 mb-1 rounded-b-none border-b border-border bg-popover",
                      i === aktiv && "bg-muted",
                      s.name === SONSTIGES && i > 0 && "mt-1 border-t border-border"
                    )}
                  >
                    <span>{s.label ?? s.name}</span>
                    {gewaehlt && <Check className="size-4 shrink-0 text-primary" aria-label="gewählt" />}
                  </li>
                );
              })}
          </ul>
        </div>
        {/* Trefferzahl für Screenreader (nur während der Suche). */}
        <p id={ansageId} className="sr-only" aria-live="polite" aria-atomic="true">
          {offen && suche !== null && suche.trim()
            ? trefferZahl === 1
              ? "1 Studiengang gefunden"
              : `${trefferZahl} Studiengänge gefunden`
            : ""}
        </p>
        {/* Gesendet wird die Auswahl, nicht der Suchtext. */}
        <input type="hidden" name={name} value={wert.auswahl} />
        <FeldFehler id={fehlerId} symbol={fehlerSymbol}>
          {fehler}
        </FeldFehler>
      </div>
      {wert.auswahl === SONSTIGES && (
        <div className="space-y-2">
          <Label htmlFor={freitextId}>{freitextLabel}</Label>
          <Input
            ref={freitextFeld}
            id={freitextId}
            name={freitextName}
            type="text"
            required={required}
            maxLength={150}
            placeholder="z. B. Wirtschaftsrecht"
            value={wert.freitext}
            onChange={(e) => onChange({ auswahl: SONSTIGES, freitext: e.target.value })}
            aria-invalid={fehlerFreitext ? true : undefined}
            aria-describedby={fehlerFreitext ? freitextFehlerId : undefined}
            className="h-11"
          />
          <FeldFehler id={freitextFehlerId} symbol={fehlerSymbol}>
            {fehlerFreitext}
          </FeldFehler>
        </div>
      )}
    </div>
  );
}
