"use client";

import { useState, type CSSProperties } from "react";
import { Check, ExternalLink, Hourglass, Newspaper } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/components/admin/format";
import { cn } from "@/lib/utils";
import { requestBvhLogin, type BvhLoginStatus } from "@/app/(intranet)/magazines/actions";
import { aktuellerSchritt, bvhPhase, fuellstand, punktZustand, type BvhPhase, type PunktZustand } from "./bvh-steps";

// Login-Seite des BVH-Mitgliederportals (unverändert übernommen).
const BVH_LOGIN_URL =
  "https://bvhev.ciamlogin.com/30e45d3e-e384-4d3c-ae5c-00810ddc692f/oauth2/v2.0/authorize?client_id=5130d735-c612-4907-a371-41687b298f50&response_type=code&redirect_uri=https%3A%2F%2Fbvh.org%2Fassets%2Fauth_external%2Fcallback.php&scope=openid+profile+email&state=d302184aff68bb60e7caafa819f980ea&nonce=34bbb217702495aee6ff9d6219a752ba&code_challenge=6cV_m-h3EUVy6pR5KC3XWi5JBrpF8uUKtiBFa3ciRsA&code_challenge_method=S256&prompt=login";

// Titel laut Intranet-Text und Website („Capital, FAZ, Stern, Börse Online, Focus und mehr“).
const MAGAZINES = ["Capital", "FAZ", "Stern", "Börse Online", "Focus"];

const STEPS = [
  { title: "Zugang beantragen", text: "Ein Klick hier, die Anfrage geht an den Vorstand." },
  {
    title: "Vorstand richtet ihn beim BVH ein",
    text: "Das macht der Vorstand von Hand, deshalb dauert es etwas.",
  },
  { title: "Im BVH-Portal anmelden", text: "Dort schließt du die Abos der Zeitschriften ab." },
];

// Ablauf nach dem Beantragen (Skizze): Erst schließt das Fenster, dann füllt sich der Balken, danach wechseln
// Punkte und Deckkraft, zuletzt erscheint die Aktion im neuen Schritt. Bei reduzierter Bewegung sofort.
const PUNKT: Record<PunktZustand, string> = {
  done: "border-2 border-primary bg-primary text-primary-foreground",
  active: "border-2 border-primary bg-card text-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--color-primary)_12%,transparent)]",
  todo: "border border-input bg-card text-muted-foreground",
};
const PUNKT_UEBERGANG =
  "transition-[background-color,color,border-color,box-shadow] duration-300 delay-1000 motion-reduce:transition-none";
const SCHRITT_UEBERGANG = "transition-opacity duration-400 delay-900 motion-reduce:transition-none";
const ERSCHEINEN =
  "animate-in fade-in-0 slide-in-from-bottom-1.5 duration-450 delay-1000 fill-mode-both ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none";

function Punkt({
  zustand,
  nummer,
  className,
  style,
}: {
  zustand: PunktZustand;
  nummer: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold tabular-nums",
        PUNKT[zustand],
        PUNKT_UEBERGANG,
        className,
      )}
    >
      {zustand === "done" ? <Check className="size-4" strokeWidth={3} /> : nummer}
    </span>
  );
}

/**
 * Vorteil „Zeitschriften über den BVH“ (Design-Runde 19.11.2026): was es gibt und darunter die drei Schritte mit
 * durchgehendem Fortschrittsbalken (Handy: untereinander mit senkrechter Linie). Der aktuelle Schritt ist voll
 * sichtbar und trägt die Aktion, die anderen sind blass. Gleiche Action wie bisher (requestBvhLogin). Ist der
 * Status unter RLS nicht lesbar, startet die Seite bei Schritt 1; eine schon offene Anfrage meldet dann die
 * Action (alreadyOpen).
 */
export function BvhLoginSection({ initialStatus }: { initialStatus: BvhLoginStatus }) {
  const [phase, setPhase] = useState<BvhPhase>(() => bvhPhase(initialStatus));
  const [requestedAt, setRequestedAt] = useState<string | null>(initialStatus.requestedAt);
  // Erst nach einem Wechsel in dieser Sitzung einblenden (beim Laden der Seite steht die Aktion sofort da).
  const [gewechselt, setGewechselt] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = aktuellerSchritt(phase);
  const datum = requestedAt ? formatDay(requestedAt) : null;

  async function handleRequest() {
    setLoading(true);
    setError(null);
    const result = await requestBvhLogin();
    setLoading(false);
    if (result.ok) {
      setPhase("requested");
      setRequestedAt(new Date().toISOString());
      setGewechselt(true);
      setOpen(false);
      toast.success("Zugang beantragt.");
    } else if (result.alreadyOpen) {
      setPhase("requested");
      setRequestedAt(null);
      setGewechselt(true);
      setOpen(false);
      toast.info("Du hast den Zugang schon beantragt.");
    } else {
      setError(result.error ?? "Anfrage konnte nicht gesendet werden.");
    }
  }

  function aktion(i: number) {
    if (i !== current) return null;
    if (phase === "none") {
      return (
        <Button
          className="mt-3.5 h-12 rounded-xl px-6 text-[0.9375rem] font-semibold shadow-brand"
          onClick={() => setOpen(true)}
        >
          Zugang beantragen
        </Button>
      );
    }
    if (phase === "requested") {
      return (
        <div
          role="status"
          className={cn(
            "mt-3.5 flex items-center gap-2.5 rounded-xl bg-brand-tint px-4 py-3 text-left",
            gewechselt && ERSCHEINEN,
          )}
        >
          <Hourglass className="size-[18px] shrink-0 text-primary" aria-hidden />
          <span className="flex flex-col gap-px">
            <span className="text-sm font-semibold text-foreground">Der Vorstand kümmert sich darum.</span>
            {/* Ohne lesbares Datum (alreadyOpen) bleibt die Datumszeile weg. */}
            {datum && datum !== "–" && <span className="text-xs text-muted-foreground">Beantragt am {datum}</span>}
          </span>
        </div>
      );
    }
    return (
      <Button asChild className={cn("mt-3.5 h-12 rounded-xl px-6 text-[0.9375rem] font-semibold shadow-brand", gewechselt && ERSCHEINEN)}>
        <a href={BVH_LOGIN_URL} target="_blank" rel="noopener noreferrer">
          Zum BVH-Portal
          <ExternalLink aria-hidden />
        </a>
      </Button>
    );
  }

  return (
    <section
      aria-labelledby="bvh-titel"
      className="flex flex-col gap-9 rounded-2xl border border-border bg-card p-5 sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-primary">
          <Newspaper className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="bvh-titel" className="text-xl leading-tight font-bold tracking-[-0.02em] text-foreground">
              Zeitschriften über den BVH
            </h2>
            {phase === "handled" && (
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-tint px-2.5 text-xs font-semibold text-success">
                <Check className="size-[13px]" strokeWidth={3} aria-hidden />
                Zugang eingerichtet
              </span>
            )}
          </div>
          <p className="max-w-[580px] text-[0.9375rem] leading-normal text-muted-foreground">
            Über die Mitgliedschaft des ICR im Bundesverband der Börsenvereine an deutschen Hochschulen (BVH)
            bekommst du Zugriff auf Zeitschriften und Journale.
          </p>
          <ul className="flex flex-wrap items-center gap-2 pt-1" aria-label="Zeitschriften">
            {MAGAZINES.map((m) => (
              <li
                key={m}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground"
              >
                {m}
              </li>
            ))}
            <li className="p-1 text-xs text-muted-foreground">und mehr</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-[22px]">
        <h3 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">So läuft es ab</h3>

        {/* Ab lg: durchgehender Balken über den drei Spalten, Punkte in der Mitte jeder Spalte. */}
        <div aria-hidden className="hidden px-[calc((100%-3rem)/6)] lg:block">
          <div className="relative h-1.5 rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] delay-350 duration-900 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ width: `${fuellstand(phase)}%` }}
            />
            {[0, 50, 100].map((left, i) => (
              <Punkt
                key={left}
                zustand={punktZustand(phase, i)}
                nummer={i + 1}
                className="absolute top-1/2 -mt-4 -ml-4"
                style={{ left: `${left}%` }}
              />
            ))}
          </div>
        </div>

        <ol className="flex flex-col lg:mt-2 lg:grid lg:grid-cols-3 lg:gap-6 lg:text-center">
          {STEPS.map((s, i) => {
            const zustand = punktZustand(phase, i);
            const aktiv = i === current;
            const letzter = i === STEPS.length - 1;
            const knopf = aktion(i);
            return (
              <li key={s.title} aria-current={aktiv ? "step" : undefined} className="flex gap-4 lg:block">
                {/* Handy: Punkt mit senkrechter Linie zum nächsten Schritt. */}
                <div aria-hidden className="flex flex-col items-center lg:hidden">
                  <Punkt zustand={zustand} nummer={i + 1} />
                  {!letzter && (
                    <span className="relative my-1 w-0.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "absolute inset-0 origin-top bg-primary transition-transform delay-350 duration-900 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                          i < current ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "flex min-w-0 flex-col gap-1 pt-1 lg:items-center lg:pt-0",
                    !letzter && "pb-6 lg:pb-0",
                    !aktiv && "opacity-[0.38]",
                    SCHRITT_UEBERGANG,
                  )}
                >
                  {zustand === "done" && <span className="sr-only">Erledigt: </span>}
                  <p className="text-[0.9375rem] font-semibold text-foreground">{s.title}</p>
                  <p className="max-w-[260px] text-[0.8125rem] leading-[1.45] text-muted-foreground">{s.text}</p>
                  {knopf && <div className="self-start lg:self-center">{knopf}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (loading) return;
          setOpen(v);
          setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>BVH-Zugang beantragen?</DialogTitle>
            <DialogDescription>
              Deine Anfrage geht an den Vorstand. Für die Anmeldung beim BVH nutzt er die Daten aus deinem Profil.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Abbrechen
            </Button>
            <Button onClick={handleRequest} disabled={loading}>
              {loading ? "Wird gesendet …" : "Beantragen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
