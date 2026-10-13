"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { IconButton, type IconButtonVariant } from "@/components/kit/IconButton";
import { eventPath } from "@/lib/events";

/** Teilen als Icon: kopiert den Link zur Veranstaltung (Fallback: Dialog mit dem Link). */
export function ShareLinkButton({
  eventId,
  title,
  variant = "ghost",
}: {
  eventId: string;
  title: string;
  variant?: IconButtonVariant;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}${eventPath(eventId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link kopiert", { description: url });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-API blockiert (z. B. ohne HTTPS): Link zum Kopieren anzeigen.
      window.prompt(`Link zu „${title}“`, url);
    }
  }

  return (
    <IconButton label={`Link zu ${title} kopieren`} variant={variant} onClick={share}>
      {copied ? <Check className="text-primary" /> : <Share2 />}
    </IconButton>
  );
}
