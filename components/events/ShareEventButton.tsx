"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { eventPath } from "@/lib/events";

type Props = {
  eventId: string;
  title: string;
  /** Mit Beschriftung statt nur Icon. */
  label?: boolean;
  className?: string;
};

export function eventUrl(eventId: string): string {
  return `${window.location.origin}${eventPath(eventId)}`;
}

export function ShareEventButton({ eventId, title, label, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const url = eventUrl(eventId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link kopiert", { description: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback, falls die Clipboard-API blockiert ist (z. B. kein HTTPS).
      window.prompt(`Link zu „${title}“`, url);
    }
  }

  const Icon = copied ? Check : Link2;
  return (
    <Button
      type="button"
      variant={label ? "outline" : "ghost"}
      size={label ? "sm" : "icon-sm"}
      onClick={handleClick}
      className={className}
      aria-label={`Link zu ${title} kopieren`}
      title="Link kopieren"
    >
      <Icon className="h-4 w-4" />
      {label && (copied ? "Kopiert" : "Link kopieren")}
    </Button>
  );
}
