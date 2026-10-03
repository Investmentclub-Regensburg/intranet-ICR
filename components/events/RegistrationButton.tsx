"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

type Props = {
  eventId: string;
  eventTitle: string;
  count: number;
  isRegistered: boolean;
  /** Event ist vorbei – keine Anmeldung mehr möglich. */
  closed?: boolean;
};

export function RegistrationButton({ eventId, eventTitle, count, isRegistered, closed }: Props) {
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
      toast.success(isRegistered ? "Abgemeldet." : "Angemeldet.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {count} {count === 1 ? "Person nimmt teil" : "Personen nehmen teil"}
        {isRegistered && " · du bist dabei"}
      </span>
      {closed ? (
        <span className="text-xs text-muted-foreground">Anmeldung geschlossen</span>
      ) : (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant={isRegistered ? "secondary" : "default"} size="sm">
              {isRegistered ? "Abmelden" : "Anmelden"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isRegistered ? "Abmeldung" : "Anmeldung"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isRegistered
                  ? `Möchtest du deine Anmeldung für „${eventTitle}“ zurückziehen?`
                  : `Möchtest du dich für „${eventTitle}“ verbindlich anmelden?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleToggle();
                }}
                disabled={loading}
              >
                {loading ? "Bitte warten…" : isRegistered ? "Abmelden" : "Anmelden"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
