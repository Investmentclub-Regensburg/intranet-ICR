"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { IconButton, type IconButtonVariant } from "@/components/kit/IconButton";
import { deleteEvent } from "@/app/(intranet)/events/actions";
import { ConfirmDialog } from "./bits";

type Props = {
  eventId: string;
  title: string;
  /** Nach dem Löschen hierhin navigieren (z. B. von der Detailseite zurück zur Liste). */
  redirectTo?: string;
  variant?: IconButtonVariant;
};

/** Löschen als Trash-Icon mit Bestätigung (Action deleteEvent unverändert). */
export function DeleteEventButton({ eventId, title, redirectTo, variant = "danger" }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleDelete(): Promise<string> {
    const { error } = await deleteEvent(eventId);
    if (error) return error;
    toast.success("Veranstaltung gelöscht.");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
    return "";
  }

  return (
    <>
      <IconButton label={`${title} löschen`} variant={variant} onClick={() => setOpen(true)}>
        <Trash2 />
      </IconButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Veranstaltung löschen?"
        description={`„${title}“ verschwindet aus Liste, Kalender und allen Übersichten. Anmeldungen und Bild werden mit gelöscht.`}
        confirmLabel="Löschen"
        busyLabel="Wird gelöscht…"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
