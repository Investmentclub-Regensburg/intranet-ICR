"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { deleteEvent } from "@/app/(intranet)/events/actions";

type Props = {
  eventId: string;
  title: string;
  /** Nach dem Löschen hierhin navigieren (z. B. von der Detailseite zurück zur Liste). */
  redirectTo?: string;
  label?: boolean;
};

export function DeleteEventButton({ eventId, title, redirectTo, label }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const { error } = await deleteEvent(eventId);
      if (error) {
        toast.error(error);
        return;
      }
      setOpen(false);
      toast.success("Event entfernt.");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size={label ? "sm" : "icon-sm"}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Event ${title} entfernen`}
          title="Event entfernen"
        >
          <Trash2 className="h-4 w-4" />
          {label && "Entfernen"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Event entfernen?</AlertDialogTitle>
          <AlertDialogDescription>
            „{title}“ verschwindet aus Events, Kalender und allen Übersichten. Anmeldungen und das Bild werden
            ebenfalls gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? "Entferne…" : "Entfernen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
