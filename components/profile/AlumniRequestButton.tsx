"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  requestAlumniStatus,
  type AlumniRequestStatus,
} from "@/app/(intranet)/profile/actions";

type Props = {
  initialStatus: AlumniRequestStatus;
  rolle: string;
  status: string;
};

type Phase = "idle" | "loading" | "requested";

const SPRING = { type: "spring", stiffness: 520, damping: 28 } as const;

/**
 * Button „Alumni-Status beantragen“ in der ICR-Akte.
 * Nach erfolgreichem Klick springt er mit kurzer Animation auf „Beantragt“ und bleibt gesperrt.
 */
export function AlumniRequestButton({ initialStatus, rolle, status }: Props) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(
    initialStatus === "pending" ? "requested" : "idle"
  );
  // Nur nach einem Klick in dieser Sitzung animieren – nicht beim Laden eines bereits offenen Antrags.
  const [justRequested, setJustRequested] = useState(false);

  if (rolle === "alumni") {
    return (
      <p className="inline-flex h-8 items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-primary" aria-hidden="true" />
        Freigeschaltet
      </p>
    );
  }

  if (status === "cancelled") {
    return <p className="text-sm text-muted-foreground">–</p>;
  }

  const requested = phase === "requested";
  const loading = phase === "loading";

  async function handleClick() {
    if (requested || loading) return;
    setPhase("loading");
    try {
      const result = await requestAlumniStatus();
      if (result.success) {
        setJustRequested(true);
        setPhase("requested");
        toast.success("Alumni-Status beantragt. Der Vorstand meldet sich bei dir.");
      } else if (result.error.includes("bereits einen offenen Antrag")) {
        setPhase("requested");
        toast.info(result.error);
      } else {
        setPhase("idle");
        toast.error(result.error || "Ein Fehler ist aufgetreten.");
      }
    } catch {
      setPhase("idle");
      toast.error("Ein unerwarteter Fehler ist aufgetreten.");
    }
  }

  return (
    <motion.button
      type="button"
      layout={!reduceMotion}
      onClick={handleClick}
      disabled={requested || loading}
      aria-live="polite"
      whileTap={requested || loading || reduceMotion ? undefined : { scale: 0.94 }}
      transition={SPRING}
      className={cn(
        buttonVariants({ variant: requested ? "secondary" : "outline", size: "sm" }),
        "relative overflow-visible",
        requested && "cursor-default disabled:opacity-100"
      )}
    >
      {/* Einmaliger „Ping“-Ring nach erfolgreichem Antrag */}
      <AnimatePresence>
        {justRequested && !reduceMotion && (
          <motion.span
            key="ring"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-md border-2 border-primary"
            initial={{ opacity: 0.9, scale: 1 }}
            animate={{ opacity: 0, scale: 1.35 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            onAnimationComplete={() => setJustRequested(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {requested ? (
          <motion.span
            key="requested"
            className="inline-flex items-center gap-1.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.span
              className="inline-flex"
              initial={reduceMotion ? false : { scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={SPRING}
            >
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            </motion.span>
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...SPRING, delay: 0.05 }}
            >
              Beantragt
            </motion.span>
          </motion.span>
        ) : loading ? (
          <motion.span
            key="loading"
            className="inline-flex items-center gap-1.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Wird gesendet…
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            className="inline-flex items-center gap-1.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            Alumni-Status beantragen
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
