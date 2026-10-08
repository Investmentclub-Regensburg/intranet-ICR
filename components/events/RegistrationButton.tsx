"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarX } from "lucide-react";
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
import { toggleRegistration } from "@/app/(intranet)/events/actions";

type Props = {
  eventId: string;
  eventTitle: string;
  /** Datum und Uhrzeit für die Bestätigung, z. B. "Fr., 17. Oktober 2026 · 19:00 Uhr". */
  when?: string;
  isRegistered: boolean;
  /** Volle Breite (Detailseite). */
  block?: boolean;
  size?: "sm" | "default";
  className?: string;
};

/**
 * Anmelden bzw. Abmelden mit Bestätigung. Status und Zähler zeigt die umgebende
 * Kachel/Seite; hier nur der Knopf und der Dialog. Logik unverändert (toggleRegistration).
 */
export function RegistrationButton({
  eventId,
  eventTitle,
  when,
  isRegistered,
  block,
  size = "sm",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    try {
      const { error } = await toggleRegistration(eventId, isRegistered);
      if (error) {
        toast.error(error);
        return;
      }
      setOpen(false);
      toast.success(isRegistered ? "Du bist abgemeldet." : "Du bist angemeldet.", {
        description: eventTitle,
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const MediaIcon = isRegistered ? CalendarX : CalendarCheck;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
      <AlertDialogTrigger asChild>
        <Button
          variant={isRegistered ? "outline" : "default"}
          size={size}
          className={cn(block && "w-full", className)}
        >
          {isRegistered ? "Abmelden" : "Anmelden"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-brand-tint text-primary">
            <MediaIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{isRegistered ? "Abmelden?" : "Verbindlich anmelden?"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{eventTitle}</p>
              {when && <p>{when}</p>}
              <p className="pt-2">
                {isRegistered
                  ? "Deine Anmeldung wird zurückgezogen."
                  : "Der Vorstand sieht dich danach auf der Teilnehmerliste."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant={isRegistered ? "destructive" : "default"}
            onClick={(e) => {
              e.preventDefault();
              handleToggle();
            }}
            disabled={loading}
          >
            {loading ? "Bitte warten …" : isRegistered ? "Abmelden" : "Anmelden"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
