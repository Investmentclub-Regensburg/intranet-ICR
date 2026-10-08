"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/kit/IconButton";
import { cn } from "@/lib/utils";
import { eventPath } from "@/lib/events";

type Props = {
  eventId: string;
  title: string;
  /** Mit Beschriftung statt nur Icon (Verwaltung). */
  label?: boolean;
  /** Icon-Variante auf einem Bild: weiße Fläche, damit es auf jedem Foto lesbar bleibt. */
  onImage?: boolean;
  className?: string;
};

export function eventUrl(eventId: string): string {
  return `${window.location.origin}${eventPath(eventId)}`;
}

export function ShareEventButton({ eventId, title, label, onImage, className }: Props) {
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

  if (label) {
    const Icon = copied ? Check : Link2;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        className={className}
        aria-label={`Link zu ${title} kopieren`}
        title="Link kopieren"
      >
        <Icon className="h-4 w-4" />
        {copied ? "Kopiert" : "Link kopieren"}
      </Button>
    );
  }

  const Icon = copied ? Check : Share2;
  return (
    <IconButton
      label={copied ? "Link kopiert" : `Link zu „${title}“ kopieren`}
      variant="ghost"
      onClick={handleClick}
      className={cn(
        onImage &&
          "rounded-full bg-card/90 text-foreground shadow-soft backdrop-blur hover:bg-card hover:text-primary",
        className,
      )}
    >
      <Icon />
    </IconButton>
  );
}
