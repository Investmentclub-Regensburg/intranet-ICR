"use client";

import { useState } from "react";
import { Check, ExternalLink, Newspaper } from "lucide-react";
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
import { StatusCard } from "@/components/kit/StatusCard";
import { cn } from "@/lib/utils";
import { requestBvhLogin, type BvhLoginStatus } from "@/app/(intranet)/magazines/actions";

// Login-Seite des BVH-Mitgliederportals (unverändert übernommen).
const BVH_LOGIN_URL =
  "https://bvhev.ciamlogin.com/30e45d3e-e384-4d3c-ae5c-00810ddc692f/oauth2/v2.0/authorize?client_id=5130d735-c612-4907-a371-41687b298f50&response_type=code&redirect_uri=https%3A%2F%2Fbvh.org%2Fassets%2Fauth_external%2Fcallback.php&scope=openid+profile+email&state=d302184aff68bb60e7caafa819f980ea&nonce=34bbb217702495aee6ff9d6219a752ba&code_challenge=6cV_m-h3EUVy6pR5KC3XWi5JBrpF8uUKtiBFa3ciRsA&code_challenge_method=S256&prompt=login";

// Titel laut Intranet-Text und Website („Capital, FAZ, Stern, Börse Online, Focus und mehr“).
const MAGAZINES = ["Capital", "FAZ", "Stern", "Börse Online", "Focus"];

type Phase = "none" | "requested" | "handled";

const STEPS = [
  { title: "Zugang beantragen", text: "Ein Klick hier, die Anfrage geht an den Vorstand." },
  {
    title: "Vorstand richtet ihn beim BVH ein",
    text: "Das macht der Vorstand von Hand, deshalb dauert es etwas.",
  },
  { title: "Im BVH-Portal anmelden", text: "Dort schließt du die Abos der Zeitschriften ab." },
];

/** StatusCard steht hier in einer schmalen Spalte: untereinander statt nebeneinander. */
const STATUS_IN_COLUMN = "sm:flex-col sm:items-stretch sm:gap-4 sm:p-5";

function PortalLink({ className }: { className?: string }) {
  return (
    <a
      href={BVH_LOGIN_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className,
      )}
    >
      Zum BVH-Portal
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

/**
 * Vorteil „Zeitschriften über den BVH“: was es gibt, wie es abläuft (3 Schritte),
 * Beantragen mit Bestätigung und danach eine Status-Kachel. Gleiche Action wie bisher
 * (requestBvhLogin). Ist der Status unter RLS nicht lesbar, startet die Seite bei
 * Schritt 1; eine schon offene Anfrage meldet dann die Action (alreadyOpen).
 */
export function BvhLoginSection({ initialStatus }: { initialStatus: BvhLoginStatus }) {
  const [phase, setPhase] = useState<Phase>(
    initialStatus.handled ? "handled" : initialStatus.hasRequested ? "requested" : "none",
  );
  const [requestedAt, setRequestedAt] = useState<string | null>(initialStatus.requestedAt);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = phase === "none" ? 0 : phase === "requested" ? 1 : 2;

  async function handleRequest() {
    setLoading(true);
    setError(null);
    const result = await requestBvhLogin();
    setLoading(false);
    if (result.ok) {
      setPhase("requested");
      setRequestedAt(new Date().toISOString());
      setOpen(false);
      toast.success("Zugang beantragt.");
    } else if (result.alreadyOpen) {
      setPhase("requested");
      setRequestedAt(null);
      setOpen(false);
      toast.info("Du hast den Zugang schon beantragt.");
    } else {
      setError(result.error ?? "Anfrage konnte nicht gesendet werden.");
    }
  }

  return (
    <section
      aria-labelledby="bvh-titel"
      className="rounded-2xl border border-border bg-card p-5 sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span className="tile-icon size-11 rounded-xl">
          <Newspaper className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-2">
          <h2 id="bvh-titel" className="text-xl leading-tight font-bold tracking-[-0.02em] text-foreground">
            Zeitschriften über den BVH
          </h2>
          <p className="max-w-xl text-[0.9375rem] text-muted-foreground">
            Über die Mitgliedschaft des ICR im Bundesverband der Börsenvereine an deutschen Hochschulen (BVH)
            bekommst du Zugriff auf Zeitschriften und Journale.
          </p>
          <ul className="flex flex-wrap gap-2 pt-1" aria-label="Zeitschriften">
            {MAGAZINES.map((m) => (
              <li
                key={m}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground"
              >
                {m}
              </li>
            ))}
            <li className="px-1 py-1 text-xs text-muted-foreground">und mehr</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* So läuft es ab */}
        <div className="order-2 lg:order-1">
          <h3 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">So läuft es ab</h3>
          <ol className="mt-4 space-y-5">
            {STEPS.map((s, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li
                  key={s.title}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex gap-4",
                    // Verbindungslinie zum nächsten Schritt
                    i < STEPS.length - 1 &&
                      "before:absolute before:top-9 before:-bottom-4 before:left-[15px] before:w-0.5 before:rounded-full",
                    i < STEPS.length - 1 && (done ? "before:bg-primary" : "before:bg-border"),
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                      done && "bg-primary text-primary-foreground",
                      active && "border-2 border-primary bg-card text-primary",
                      !done && !active && "border border-input bg-card text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-4" aria-label="erledigt" /> : i + 1}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className={cn("text-sm font-semibold", done || active ? "text-foreground" : "text-muted-foreground")}>
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
                    {i === 2 && phase !== "handled" && <PortalLink className="mt-2" />}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Aktion bzw. Status */}
        <div className="order-1 lg:order-2">
          {phase === "none" && (
            <div className="space-y-3 rounded-2xl border border-border bg-background p-5">
              <p className="text-sm font-semibold text-foreground">Noch kein Zugang?</p>
              <Button className="w-full" onClick={() => setOpen(true)}>
                Zugang beantragen
              </Button>
            </div>
          )}

          {phase !== "none" && (
            <div role="status">
              {phase === "requested" ? (
                // Ohne lesbares Datum (alreadyOpen) bleibt die Datumszeile weg.
                <StatusCard
                  status="open"
                  title="Zugang beantragt"
                  date={requestedAt}
                  next="Der Vorstand schaltet deinen Zugang frei."
                  className={STATUS_IN_COLUMN}
                />
              ) : (
                <StatusCard
                  status="done"
                  title="Zugang eingerichtet"
                  date={requestedAt}
                  dateLabel="Beantragt am"
                  next="Melde dich im BVH-Portal an."
                  className={STATUS_IN_COLUMN}
                  action={
                    <Button asChild className="w-full">
                      <a href={BVH_LOGIN_URL} target="_blank" rel="noopener noreferrer">
                        Zum BVH-Portal
                        <ExternalLink aria-hidden />
                      </a>
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => {
          if (loading) return;
          setOpen(v);
          setError(null);
        }}>
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
