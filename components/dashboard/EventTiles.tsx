"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowRight, Check, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toggleRegistration } from "@/app/(intranet)/events/actions";
import { eventPath } from "@/lib/events";
import { cn } from "@/lib/utils";
import { DASH_FOCUS, DASH_TILE, DateBlock, TileIn } from "./parts";
import type { DashboardEvent } from "./types";

const EASE = [0.22, 1, 0.36, 1] as const;
const MotionLink = motion.create(Link);

/** Nächste Events als Kacheln: Datum groß, Zeit/Ort, Anmeldestatus oder „Anmelden“. */
export function NextEventTiles({ events }: { events: DashboardEvent[] }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        {events.map((event, i) => (
          <TileIn key={event.id} index={i}>
            <EventTile event={event} />
          </TileIn>
        ))}
      </div>
    </MotionConfig>
  );
}

function EventTile({ event }: { event: DashboardEvent }) {
  // Nach dem Anmelden sofort umschalten; router.refresh() liefert danach den Serverstand.
  const [justRegistered, setJustRegistered] = useState(false);
  const registered = event.registered || justRegistered;

  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={cn(DASH_TILE, "flex h-full flex-col gap-4 p-5")}
    >
      <div className="flex items-start gap-4">
        <DateBlock day={event.day} month={event.month} weekday={event.weekday} label={event.dateLabel} />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          {event.relative && (
            <p
              className={cn(
                "text-xs font-semibold",
                event.soon ? "text-primary" : "text-muted-foreground",
              )}
            >
              {event.relative}
            </p>
          )}
          <h3 className="line-clamp-2 text-base leading-snug font-bold tracking-[-0.02em]">
            {/* Ganze Kachel klickbar (Link über die Fläche gespannt), der Anmelde-Knopf liegt darüber. */}
            <Link
              href={eventPath(event.id)}
              className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/40"
            >
              {event.title}
            </Link>
          </h3>
          {(event.timeLabel || event.location) && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {event.timeLabel && (
                <li className="flex items-center gap-1.5">
                  <Clock className="size-3.5 shrink-0" aria-hidden />
                  <span>{event.timeLabel}</span>
                </li>
              )}
              {event.location && (
                <li className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{event.location}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3">
        <AnimatePresence mode="wait" initial={false}>
          {registered ? (
            <motion.span
              key="registered"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 28 }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
              Angemeldet
            </motion.span>
          ) : event.requiresRegistration ? (
            <motion.div
              key="register"
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="relative z-10"
            >
              <RegisterButton
                eventId={event.id}
                eventTitle={event.title}
                onRegistered={() => setJustRegistered(true)}
              />
            </motion.div>
          ) : (
            <span key="open" className="text-xs text-muted-foreground">
              Ohne Anmeldung
            </span>
          )}
        </AnimatePresence>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-300 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      </div>
    </motion.article>
  );
}

/** Anmelden mit Rückfrage, gleiche Action und Texte wie RegistrationButton auf der Events-Seite. */
function RegisterButton({
  eventId,
  eventTitle,
  onRegistered,
}: {
  eventId: string;
  eventTitle: string;
  onRegistered: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setLoading(true);
    try {
      const { error } = await toggleRegistration(eventId, false);
      if (error) {
        toast.error(error);
        return;
      }
      setOpen(false);
      toast.success("Angemeldet.");
      onRegistered();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" aria-label={`Für „${eventTitle}“ anmelden`}>
          Anmelden
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anmeldung</AlertDialogTitle>
          <AlertDialogDescription>
            Möchtest du dich für „{eventTitle}“ verbindlich anmelden?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading}
          >
            {loading ? "Bitte warten …" : "Anmelden"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Meine Anmeldungen: kompakte Kacheln, ganze Fläche führt zum Event. */
export function MyRegistrationTiles({ events, total }: { events: DashboardEvent[]; total: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-1 gap-3">
        {events.map((event, i) => (
          <TileIn key={event.id} index={i}>
            <MotionLink
              href={eventPath(event.id)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={cn(DASH_TILE, DASH_FOCUS, "flex items-center gap-3 p-3 pr-4")}
            >
              <DateBlock
                size="sm"
                day={event.day}
                month={event.month}
                weekday={event.weekday}
                label={event.dateLabel}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold tracking-[-0.01em]">{event.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[event.relative, event.timeLabel, event.location].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-[translate,color] duration-300 group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden
              />
            </MotionLink>
          </TileIn>
        ))}
        {total > events.length && (
          <Link
            href="/profile"
            className={cn(
              "rounded-xs px-1 text-sm font-semibold text-primary hover:text-brand-hover",
              DASH_FOCUS,
            )}
          >
            Alle {total} Anmeldungen im Profil
          </Link>
        )}
      </div>
    </MotionConfig>
  );
}
