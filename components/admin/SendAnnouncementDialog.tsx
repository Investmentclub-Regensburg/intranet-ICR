"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendEventAnnouncement } from "@/app/(intranet)/events/actions";
import type { AnnouncementTarget } from "@/lib/events";
import { AnnouncementRecipients, recipientCount } from "./AnnouncementRecipients";

type Props = {
  eventId: string;
  eventTitle: string;
  memberCount: number;
};

/** Event-Mail nachträglich (erneut) verschicken – z. B. erst Test an sich selbst, dann an alle. */
export function SendAnnouncementDialog({ eventId, eventTitle, memberCount }: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<AnnouncementTarget>({ mode: "custom", emails: [] });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const count = recipientCount(target, memberCount);

  function handleSend() {
    startTransition(async () => {
      const { count: sent, error } = await sendEventAnnouncement(eventId, target);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Mail an ${sent} Empfänger wird verschickt.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="h-4 w-4" />
          Mail senden
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mitglieder informieren</DialogTitle>
          <DialogDescription>
            Mail mit Vorschau und Link zu „{eventTitle}“ verschicken.
          </DialogDescription>
        </DialogHeader>
        <AnnouncementRecipients
          value={target}
          onChange={setTarget}
          memberCount={memberCount}
          disabled={isPending}
        />
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
  );
}
