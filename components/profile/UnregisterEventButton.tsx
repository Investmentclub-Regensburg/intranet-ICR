"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundX } from "lucide-react";
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
import { IconButton } from "@/components/kit/IconButton";
import { toggleRegistration } from "@/app/(intranet)/events/actions";

type Props = {
  eventId: string;
  eventTitle: string;
};

/** Abmelden als Icon-Aktion in der Kachel, mit Bestätigung. Logik wie bisher (toggleRegistration). */
export function UnregisterEventButton({ eventId, eventTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleUnregister() {
    setLoading(true);
    try {
      const { error } = await toggleRegistration(eventId, true);
      if (error) toast.error(error);
      else {
        setOpen(false);
        toast.success("Abgemeldet.");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <IconButton label="Von Veranstaltung abmelden" variant="danger">
          <UserRoundX />
        </IconButton>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Abmelden?</AlertDialogTitle>
          <AlertDialogDescription>
            Deine Anmeldung für „{eventTitle}“ wird zurückgezogen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleUnregister();
            }}
            disabled={loading}
          >
            {loading ? "Bitte warten…" : "Abmelden"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
