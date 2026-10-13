"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { IconButton } from "@/components/kit/IconButton";
import { cn } from "@/lib/utils";
import { deleteNews } from "@/app/(intranet)/news/actions";

type Props = {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  /** Seit dem letzten Besuch neu. */
  unread?: boolean;
  canDelete?: boolean;
};

/** Eingeklappt: drei Zeilen (Zeilenhöhe 1.625). */
const COLLAPSED = "4.875em";

/**
 * Mitteilung auf dem Schwarzen Brett: ruhige Karte, Datum als Eyebrow, Text auf drei
 * Zeilen gekürzt und weich aufklappbar. Ungelesenes trägt eine rote Kante links.
 */
export function NewsCard({ id, title, content, author, date, unread = false, canDelete = false }: Props) {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [fullHeight, setFullHeight] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const textRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Höhe des vollen Texts messen (auch nach Größenänderung), um zu entscheiden, ob
  // „Weiterlesen“ nötig ist, und um weich auf die volle Höhe zu animieren.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
      setFullHeight(el.scrollHeight);
      setOverflowing(el.scrollHeight > lineHeight * 3 + 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [content]);

  function handleDelete() {
    startTransition(async () => {
      const { error } = await deleteNews(id);
      if (error) {
        toast.error(error || "Mitteilung konnte nicht entfernt werden.");
        return;
      }
      setConfirmOpen(false);
      toast.success("Mitteilung gelöscht.");
    });
  }

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6",
        unread && "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="eyebrow">{date}</p>
          {unread && (
            <span className="rounded-full bg-primary px-2 text-[11px] leading-5 font-semibold text-primary-foreground">
              Neu
            </span>
          )}
        </div>
        {canDelete && (
          <IconButton
            label="Mitteilung löschen"
            variant="danger"
            className="-mt-2 -mr-2"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
          </IconButton>
        )}
      </div>

      <h2 className="mt-3 text-lg leading-snug font-bold tracking-[-0.02em] text-foreground">{title}</h2>

      <div
        id={panelId}
        className="relative mt-2 overflow-hidden text-[0.9375rem] leading-[1.625] text-foreground/85 transition-[max-height] duration-500 ease-out motion-reduce:transition-none"
        style={{ maxHeight: open ? (fullHeight ?? undefined) : COLLAPSED }}
      >
        <div ref={textRef} className="break-words whitespace-pre-wrap">
          {content}
        </div>
        {!open && overflowing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{author}</p>
        {overflowing && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xs text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            {open ? "Weniger" : "Weiterlesen"}
            <ChevronDown
              className={cn("size-4 transition-transform duration-300", open && "rotate-180")}
              aria-hidden
            />
          </button>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => !isPending && setConfirmOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitteilung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{title}“ verschwindet für alle Mitglieder vom Schwarzen Brett.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {isPending ? "Wird gelöscht …" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
