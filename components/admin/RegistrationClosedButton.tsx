"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setRegistrationClosed } from "@/app/(intranet)/events/actions";
import { ConfirmDialog } from "./bits";

type Props = {
  eventId: string;
  closed: boolean;
  /** Beim Öffnen rücken so viele Personen höchstens nach (Bestätigung nötig, es gehen Mails raus). */
  waitlistCount: number;
};

/** Anmeldung manuell schließen bzw. wieder öffnen. */
export function RegistrationClosedButton({ eventId, closed, waitlistCount }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function apply(nextClosed: boolean): Promise<string> {
    const { error } = await setRegistrationClosed(eventId, nextClosed);
    if (error) return error;
    toast.success(nextClosed ? "Anmeldung geschlossen." : "Anmeldung geöffnet.");
    router.refresh();
    return "";
  }

  function handleClick() {
    if (closed && waitlistCount > 0) {
      setConfirmOpen(true);
      return;
    }
    startTransition(async () => {
      const error = await apply(!closed);
      if (error) toast.error(error);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {closed ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
        {closed ? "Anmeldung öffnen" : "Anmeldung schließen"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Anmeldung öffnen?"
        description={
          waitlistCount === 1
            ? "Ist ein Platz frei, rückt die Person auf der Warteliste nach und bekommt eine Mail."
            : `Freie Plätze werden aus der Warteliste (${waitlistCount} Personen) der Reihe nach besetzt. Wer nachrückt, bekommt eine Mail.`
        }
        confirmLabel="Öffnen"
        busyLabel="Wird geöffnet…"
        onConfirm={() => apply(false)}
      />
    </>
  );
}
