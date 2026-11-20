"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Check, Mail, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FeldHinweis } from "@/components/member/MemberInputs";
import { readEmailChange, requestEmailChange, resendEmailChange } from "@/app/(intranet)/profile/actions";
import { emailTippfehler } from "@/lib/member-rules-client";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { neuBestaetigt, type EmailChangeStand, type FensterAnsicht } from "@/lib/email-change";

const EASE = [0.22, 1, 0.36, 1] as const;
/** Abfrage des Stands, solange das Fenster beide Postfächer zeigt (Link z. B. am Handy geklickt). */
const ABFRAGE_MS = 4000;
/** Leiste füllt sich, danach Erfolg (wie Skizze EmailAendern.dc.html). */
const BIS_ERFOLG_MS = 1500;
/** Erfolg schließt nach knapp zwei Sekunden von selbst. */
const ERFOLG_ZU_MS = 1900;

export type Postfach = "alt" | "neu";

/** Was das Fenster beim Schließen an das Profil zurückgibt. */
export type FensterErgebnis =
  | { art: "geaendert"; email: string }
  | { art: "stand"; neueAdresse: string | null; stand: EmailChangeStand };

type Props = {
  ansicht: FensterAnsicht;
  /** Aktuell gültige Adresse (Kachel „Bisher“). */
  email: string;
  neueAdresse: string | null;
  stand: EmailChangeStand;
  /** Postfach, dessen Haken sich beim Öffnen zeichnet (direkt nach dem Klick auf den Link). */
  gerade: Postfach | null;
  /** Meldung beim Öffnen (z. B. Link abgelaufen). */
  meldung?: string;
  onClose: (ergebnis: FensterErgebnis) => void;
};

/**
 * E-Mail ändern als Fenster in der Mitte (Skizze EmailAendern.dc.html, Variante A „Zwei Postfächer im Fenster“):
 * 1. neue Adresse eingeben, 2. „Bestätige in beiden Postfächern“ mit zwei gleich großen Kacheln (Bisher, Neu),
 * je ein Kreis mit Haken und eine Leiste in zwei Abschnitten, 3. Erfolg mit Haken im ICR-Rot.
 * Bewegung nur direkt nach einer Bestätigung; bei „Bewegung reduzieren“ ohne Animation.
 */
export function EmailAendernFenster(props: Props) {
  // Eigener Zustand je Öffnen: Das Profil hängt das Fenster nur ein, solange es offen ist.
  const reduziert = useReducedMotionSafe();
  const [ansicht, setAnsicht] = useState<FensterAnsicht>(props.ansicht);
  const [email, setEmail] = useState(props.email);
  const [neueAdresse, setNeueAdresse] = useState(props.neueAdresse);
  const [stand, setStand] = useState(props.stand);
  /** Beide bestätigt (Änderung durch), Leiste füllt sich noch bis zum Erfolg. */
  const [fertig, setFertig] = useState(props.ansicht === "erfolg");
  const [gerade, setGerade] = useState<Postfach | null>(props.gerade);
  const [meldung, setMeldung] = useState(props.meldung ?? "");
  const [gesendet, setGesendet] = useState(false);
  const [pending, startTransition] = useTransition();
  const zuletzt = useRef({ email, neueAdresse, stand, fertig });
  useEffect(() => {
    zuletzt.current = { email, neueAdresse, stand, fertig };
  }, [email, neueAdresse, stand, fertig]);
  const timer = useRef<number[]>([]);

  useEffect(() => {
    const laufend = timer.current;
    return () => laufend.forEach((t) => window.clearTimeout(t));
  }, []);
  const spaeter = (fn: () => void, ms: number) => {
    timer.current.push(window.setTimeout(fn, ms));
  };

  function schliessen() {
    const z = zuletzt.current;
    if (z.fertig) props.onClose({ art: "geaendert", email: z.email });
    else props.onClose({ art: "stand", neueAdresse: z.stand.offen ? z.neueAdresse : null, stand: z.stand });
  }

  /** Beide Postfächer bestätigt: letzter Abschnitt füllt sich, dann Erfolg (der schließt von selbst). */
  function abschliessen(zuletztBestaetigt: Postfach | null) {
    setFertig(true);
    setGerade(zuletztBestaetigt);
    setMeldung("");
    spaeter(() => setAnsicht("erfolg"), reduziert ? 400 : BIS_ERFOLG_MS);
  }

  // Erfolg schließt nach knapp zwei Sekunden.
  useEffect(() => {
    if (ansicht !== "erfolg") return;
    const t = window.setTimeout(schliessen, ERFOLG_ZU_MS);
    return () => window.clearTimeout(t);
    // schliessen liest nur Refs und Props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ansicht]);

  // Solange beide Postfächer zu sehen sind: Stand nachfragen (Bestätigung in einem anderen Tab oder Gerät).
  useEffect(() => {
    if (ansicht !== "postfaecher" || fertig) return;
    let laeuft = false;
    let aktiv = true;
    const frage = async () => {
      if (laeuft || document.visibilityState !== "visible") return;
      laeuft = true;
      try {
        const info = await readEmailChange();
        if (!aktiv || !info) return;
        const z = zuletzt.current;
        if (!info.stand.offen) {
          // Änderung durch: Die bisher gewartete Adresse ist jetzt die gültige.
          if (z.neueAdresse && info.email.toLowerCase() === z.neueAdresse.toLowerCase()) {
            setEmail(info.email);
            abschliessen(z.stand.alt ? "neu" : z.stand.neu ? "alt" : null);
          }
          return;
        }
        const neu = neuBestaetigt(z.stand, info.stand);
        if (neu || info.stand.anzahl !== z.stand.anzahl || info.neueAdresse !== z.neueAdresse) {
          setGerade(neu);
          setStand(info.stand);
          setNeueAdresse(info.neueAdresse);
          if (neu) setMeldung("");
        }
      } catch {
        // Netz weg o. Ä.: beim nächsten Mal wieder
      } finally {
        laeuft = false;
      }
    };
    const t = window.setInterval(frage, ABFRAGE_MS);
    return () => {
      aktiv = false;
      window.clearInterval(t);
    };
    // abschliessen setzt nur Zustand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ansicht, fertig]);

  function anfragen(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMeldung("");
    startTransition(async () => {
      try {
        const result = await requestEmailChange(formData);
        if (result.success && result.pendingEmail && result.stand) {
          setNeueAdresse(result.pendingEmail);
          setStand(result.stand);
          setGerade(null);
          setGesendet(false);
          setAnsicht("postfaecher");
        } else {
          setMeldung(result.error || "Die Änderung konnte nicht gestartet werden.");
        }
      } catch {
        setMeldung("Die Änderung konnte nicht gestartet werden. Bitte versuch es noch einmal.");
      }
    });
  }

  function erneutSenden() {
    setMeldung("");
    startTransition(async () => {
      try {
        const result = await resendEmailChange();
        if (result.info) {
          setStand(result.info.stand);
          setNeueAdresse(result.info.neueAdresse);
          setGerade(null);
        }
        if (result.success) {
          setGesendet(true);
          spaeter(() => setGesendet(false), 2500);
        } else if (result.wartenSekunden) {
          setMeldung(`Erneut senden geht in ${result.wartenSekunden} s.`);
        } else {
          setMeldung(result.error || "Die Mails konnten nicht gesendet werden.");
        }
      } catch {
        setMeldung("Die Mails konnten nicht gesendet werden. Bitte versuch es noch einmal.");
      }
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(offen) => {
        if (!offen && !pending) schliessen();
      }}
    >
      <DialogContent
        // Fokus nicht auf den ersten Knopf springen lassen (Eingabe setzt ihn selbst, sonst bleibt er im Fenster).
        onOpenAutoFocus={(e) => {
          if (ansicht !== "eingabe") e.preventDefault();
        }}
        className="block max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[18px] p-0 sm:max-w-[560px]"
      >
        {ansicht === "eingabe" && (
          <Eingabe pending={pending} meldung={meldung} onSubmit={anfragen} onAbbrechen={schliessen} />
        )}
        {ansicht === "postfaecher" && (
          <Postfaecher
            email={email}
            neueAdresse={neueAdresse ?? ""}
            alt={stand.alt || fertig}
            neu={stand.neu || fertig}
            gerade={reduziert ? null : gerade}
            meldung={meldung}
            gesendet={gesendet}
            pending={pending}
            onErneut={erneutSenden}
            onSchliessen={schliessen}
          />
        )}
        {ansicht === "erfolg" && <Erfolg adresse={email} reduziert={reduziert} onClick={schliessen} />}
        {ansicht === "fehler" && <LinkUngueltig onSchliessen={schliessen} />}
      </DialogContent>
    </Dialog>
  );
}

function Eingabe({
  pending,
  meldung,
  onSubmit,
  onAbbrechen,
}: {
  pending: boolean;
  meldung: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onAbbrechen: () => void;
}) {
  const id = useId();
  const [tippfehler, setTippfehler] = useState<string | null>(null);
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 px-6 pt-[26px] pb-6">
      <DialogTitle className="text-center text-xl">E-Mail ändern</DialogTitle>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={`${id}-neu`} className="text-[0.8125rem] font-medium text-foreground">
          Neue E-Mail-Adresse
        </Label>
        <Input
          id={`${id}-neu`}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="neue@adresse.de"
          required
          autoFocus
          aria-invalid={meldung ? true : undefined}
          aria-describedby={meldung ? `${id}-meldung` : undefined}
          className="h-11 text-[0.9375rem]"
          onChange={(e) => setTippfehler(emailTippfehler(e.target.value))}
        />
        <FeldHinweis>{tippfehler}</FeldHinweis>
        {meldung && (
          <p id={`${id}-meldung`} role="alert" className="text-sm text-destructive">
            {meldung}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Button type="button" variant="outline" className="h-11" onClick={onAbbrechen} disabled={pending}>
          Abbrechen
        </Button>
        <Button type="submit" className="h-11 font-semibold" disabled={pending}>
          {pending ? "Wird gesendet…" : "Weiter"}
        </Button>
      </div>
    </form>
  );
}

function Postfaecher({
  email,
  neueAdresse,
  alt,
  neu,
  gerade,
  meldung,
  gesendet,
  pending,
  onErneut,
  onSchliessen,
}: {
  email: string;
  neueAdresse: string;
  alt: boolean;
  neu: boolean;
  gerade: Postfach | null;
  meldung: string;
  gesendet: boolean;
  pending: boolean;
  onErneut: () => void;
  onSchliessen: () => void;
}) {
  const anzahl = (alt ? 1 : 0) + (neu ? 1 : 0);
  const faecher: { key: Postfach; nr: number; label: string; adresse: string; done: boolean }[] = [
    { key: "alt", nr: 1, label: "Bisher", adresse: email, done: alt },
    { key: "neu", nr: 2, label: "Neu", adresse: neueAdresse, done: neu },
  ];
  return (
    <div>
      <div className="flex flex-col gap-5 px-6 pt-[26px] pb-[22px]">
        <DialogTitle className="text-center text-xl">Bestätige in beiden Postfächern</DialogTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {faecher.map((f) => (
            <div
              key={f.key}
              data-postfach={f.key}
              data-bestaetigt={f.done ? "ja" : "nein"}
              className={cn(
                "flex min-w-0 flex-col gap-3.5 rounded-[14px] border p-4 transition-colors duration-400",
                f.done ? "border-primary/35 bg-primary/[0.03]" : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-tint text-primary">
                  <Mail className="size-[18px]" aria-hidden />
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background ring-2 ring-card"
                  >
                    {f.nr}
                  </span>
                </span>
                <span
                  role="img"
                  aria-label={`Postfach ${f.nr}: ${f.done ? "bestätigt" : "noch offen"}`}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-2 transition-colors duration-300",
                    f.done ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {f.done && <Haken zeichnen={gerade === f.key} className="size-4" strichstaerke={3} />}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-xs text-muted-foreground">{f.label}</span>
                <span className="mt-0.5 block text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{f.adresse}</span>
              </div>
            </div>
          ))}
        </div>
        <div
          role="progressbar"
          aria-label="Bestätigt"
          aria-valuemin={0}
          aria-valuemax={2}
          aria-valuenow={anzahl}
          aria-valuetext={`${anzahl} von 2 bestätigt`}
          className="grid grid-cols-2 gap-1.5"
        >
          {faecher.map((f) => (
            <span key={f.key} className="h-1.5 overflow-hidden rounded-full bg-muted">
              {f.done && (
                <motion.span
                  className="block h-full rounded-full bg-primary"
                  initial={gerade === f.key ? { width: "0%" } : false}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.2, ease: "easeInOut" }}
                />
              )}
            </span>
          ))}
        </div>
        {meldung && (
          <p role="alert" className="text-center text-sm text-destructive">
            {meldung}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-3.5">
        {gesendet ? (
          <span role="status" className="inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-semibold text-success">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
            Gesendet
          </span>
        ) : (
          <button
            type="button"
            onClick={onErneut}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[0.8125rem] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60"
          >
            <RotateCw className="size-3.5" aria-hidden />
            {pending ? "Wird gesendet…" : "Mails erneut senden"}
          </button>
        )}
        <Button type="button" variant="outline" className="h-11 px-[18px]" onClick={onSchliessen}>
          Schließen
        </Button>
      </div>
    </div>
  );
}

function Erfolg({ adresse, reduziert, onClick }: { adresse: string; reduziert: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-center gap-3.5 rounded-[18px] px-6 pt-11 pb-10 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <motion.span
        className="flex size-[88px] items-center justify-center rounded-full bg-brand-tint text-primary"
        initial={reduziert ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <Haken zeichnen={!reduziert} verzoegerung={0.3} className="size-10" strichstaerke={2.5} />
      </motion.span>
      <DialogTitle asChild>
        <span className="mt-1 block text-[1.375rem] font-bold tracking-[-0.02em]">Deine E-Mail-Adresse wurde geändert</span>
      </DialogTitle>
      <span className="text-[0.9375rem] text-muted-foreground [overflow-wrap:anywhere]">{adresse}</span>
    </button>
  );
}

function LinkUngueltig({ onSchliessen }: { onSchliessen: () => void }) {
  return (
    <div className="flex flex-col gap-5 px-6 pt-[26px] pb-6">
      <DialogTitle className="text-center text-xl">Dieser Link gilt nicht mehr</DialogTitle>
      <Button type="button" variant="outline" className="h-11" onClick={onSchliessen}>
        Schließen
      </Button>
    </div>
  );
}

/** Haken, der sich zeichnet (nur direkt nach einer Bestätigung), sonst steht er sofort. */
function Haken({
  zeichnen,
  verzoegerung = 0.1,
  className,
  strichstaerke,
}: {
  zeichnen: boolean;
  verzoegerung?: number;
  className?: string;
  strichstaerke: number;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strichstaerke} aria-hidden>
      <motion.path
        d="M20 6 9 17l-5-5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={zeichnen ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: "easeOut", delay: verzoegerung }}
      />
    </svg>
  );
}
