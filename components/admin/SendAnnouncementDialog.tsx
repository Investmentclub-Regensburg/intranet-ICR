"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/kit/IconButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendEventAnnouncement } from "@/app/(intranet)/events/actions";
import type { AnnouncementTarget } from "@/lib/events";
import { AnnouncementRecipients, recipientCount } from "./AnnouncementRecipients";

type Props = {
  eventId: string;
  eventTitle: string;
  memberCount: number;
  /** Einzelne Adressen nur für den Vorstand (die Server Action prüft das ebenfalls). */
  canCustom: boolean;
};

/** Event-Mail nachträglich (erneut) verschicken – z. B. erst Test an sich selbst, dann an alle. */
export function SendAnnouncementDialog({ eventId, eventTitle, memberCount, canCustom }: Props) {
  const initial: AnnouncementTarget = canCustom ? { mode: "custom", emails: [] } : { mode: "all" };
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AnnouncementTarget>(initial);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const count = recipientCount(target, memberCount);

  function handleSend() {
    setError("");
    startTransition(async () => {
      const { count: sent, error } = await sendEventAnnouncement(eventId, target);
      if (error) {
        setError(error);
        return;
      }
      toast.success(`Mail an ${sent} Empfänger wird verschickt.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <IconButton label="Mail senden" variant="outline" onClick={() => setOpen(true)}>
        <Mail />
      </IconButton>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (isPending) return;
          setOpen(next);
          if (!next) {
            setTarget(initial);
            setError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mitglieder informieren</DialogTitle>
            <DialogDescription>Mail mit Vorschau und Link zu „{eventTitle}“.</DialogDescription>
          </DialogHeader>
          <AnnouncementRecipients
            value={target}
            onChange={setTarget}
            memberCount={memberCount}
            canCustom={canCustom}
            disabled={isPending}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Abbrechen
            </Button>
            <Button onClick={handleSend} disabled={isPending || count === 0}>
              {isPending ? "Wird gesendet…" : `An ${count} senden`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
