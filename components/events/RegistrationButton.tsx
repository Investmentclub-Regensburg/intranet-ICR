"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarX, ListPlus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { joinEvent, leaveEvent } from "@/app/(intranet)/events/actions";
import type { RegistrationStatus } from "@/lib/events";

type Props = {
  eventId: string;
  eventTitle: string;
  /** Datum und Uhrzeit für die Bestätigung, z. B. "Fr., 17. Oktober 2026 · 19:00 Uhr". */
  when?: string;
  status: RegistrationStatus;
  /** Ausgebucht: Eintragen heißt Warteliste. */
  full?: boolean;
  /** Volle Breite (Detailseite). */
  block?: boolean;
  size?: "sm" | "default";
  className?: string;
};

const COPY = {
  join: {
    trigger: "Anmelden",
    title: "Verbindlich anmelden?",
    text: "Der Vorstand sieht dich danach auf der Teilnehmerliste.",
    confirm: "Anmelden",
  },
  waitlist: {
    trigger: "Auf die Warteliste",
    title: "Auf die Warteliste?",
    text: "Wird ein Platz frei, rückst du automatisch nach, bist verbindlich angemeldet und bekommst eine Mail.",
    confirm: "Eintragen",
  },
  leave: {
    trigger: "Abmelden",
    title: "Abmelden?",
    text: "Deine Anmeldung wird zurückgezogen.",
    confirm: "Abmelden",
  },
  leaveWaitlist: {
    trigger: "Austragen",
    title: "Von der Warteliste austragen?",
    text: "Du rückst dann nicht mehr nach.",
    confirm: "Austragen",
  },
} as const;

/**
 * Anmelden, Warteliste oder Abmelden mit Bestätigung. Status und Zähler zeigt die umgebende
 * Kachel/Seite; hier nur der Knopf und der Dialog.
 */
export function RegistrationButton({
  eventId,
  eventTitle,
  when,
  status,
  full = false,
  block,
  size = "sm",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const leaving = status !== "none";
  const copy =
    status === "registered" ? COPY.leave : status === "waitlisted" ? COPY.leaveWaitlist : full ? COPY.waitlist : COPY.join;

  async function handleConfirm() {
    setLoading(true);
    try {
      if (status === "none") {
        const result = await joinEvent(eventId);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(result.status === "waitlisted" ? "Du stehst auf der Warteliste." : "Du bist angemeldet.", {
          description: eventTitle,
        });
      } else {
        const { error } = await leaveEvent(eventId, status);
        if (error) {
          toast.error(error);
          router.refresh();
          return;
        }
        toast.success(status === "waitlisted" ? "Du bist von der Warteliste ausgetragen." : "Du bist abgemeldet.", {
          description: eventTitle,
        });
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const MediaIcon = leaving ? CalendarX : full ? ListPlus : CalendarCheck;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
      <AlertDialogTrigger asChild>
        <Button variant={leaving ? "outline" : "default"} size={size} className={cn(block && "w-full", className)}>
          {copy.trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-brand-tint text-primary">
            <MediaIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{eventTitle}</p>
              {when && <p>{when}</p>}
              <p className="pt-2">{copy.text}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant={leaving ? "destructive" : "default"}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading}
          >
            {loading ? "Bitte warten …" : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
