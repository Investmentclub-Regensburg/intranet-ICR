"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlignLeft, ArrowRight, CheckCircle2, Eye, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogClose } from "@/components/ui/dialog";
import { IconButton } from "@/components/kit/IconButton";
import {
  WizardDialog,
  WizardNav,
  WizardProgress,
  WizardLayout,
  WizardPreview,
  WizardStep,
  WizardSummary,
  useWizard,
  type WizardRow,
} from "@/components/kit/Wizard";
import { NewsCard } from "@/components/news/NewsCard";
import { createNews } from "@/app/(intranet)/news/actions";

// Neue Mitteilung fürs Schwarze Brett als Wizard: Betreff → Text → Vorschau → Veröffentlichen.
// Gespeichert wird mit der unveränderten Action createNews (FormData mit title/content).

const STEPS = [
  { key: "title", label: "Betreff", Icon: Type },
  { key: "content", label: "Text", Icon: AlignLeft },
  { key: "preview", label: "Vorschau", Icon: Eye },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const MAX_TITLE = 200;
const MAX_CONTENT = 10000;

export function NewsWizard({
  open,
  onOpenChange,
  authorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Für die Vorschau („von …“). */
  authorName: string;
}) {
  const router = useRouter();
  const wizard = useWizard(STEPS);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);
  const [isPending, startTransition] = useTransition();

  function next(key: StepKey) {
    let problem = "";
    if (key === "title" && !title.trim()) problem = "Bitte einen Betreff eingeben.";
    if (key === "content" && !content.trim()) problem = "Bitte einen Text eingeben.";
    setError(problem);
    if (!problem) wizard.complete(key);
  }

  function goTo(key: StepKey) {
    setError("");
    wizard.goTo(key);
  }

  function publish() {
    setError("");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("content", content);
      const result = await createNews({ success: false, error: "" }, fd);
      if (!result.success) {
        setError(result.error || "Mitteilung konnte nicht veröffentlicht werden.");
        return;
      }
      setPublished(true);
      router.refresh();
    });
  }

  const rows: WizardRow<StepKey>[] = [];
  if (wizard.completed.includes("title")) rows.push({ key: "title", label: "Betreff", Icon: Type, value: title.trim() });
  if (wizard.completed.includes("content"))
    rows.push({ key: "content", label: "Text", Icon: AlignLeft, value: content.trim() });

  const stepProps = (key: StepKey) => ({
    stepKey: key,
    active: wizard.step === key,
    direction: wizard.direction,
    // Platz für das Schließen-X oben rechts
    className: "[&>h2]:pr-10",
  });
  const errorLine = error ? (
    <p role="alert" className="text-sm font-medium text-destructive">
      {error}
    </p>
  ) : null;
  // Gleiches Datumsformat wie die Liste unter /news.
  const today = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Neue Mitteilung"
      dirty={!published && (title.trim() !== "" || content.trim() !== "" || isPending)}
    >
      <DialogClose asChild>
        <IconButton label="Schließen" className="absolute top-3 right-3 z-10">
          <X />
        </IconButton>
      </DialogClose>

      {published ? (
        <div className="flex flex-col items-center gap-5 px-6 py-14 text-center sm:px-12">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-tint text-primary">
            <CheckCircle2 className="size-7" aria-hidden />
          </span>
          <h2 className="text-2xl font-bold tracking-[-0.03em]">Die Mitteilung hängt am Schwarzen Brett.</h2>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/news">
                <Eye aria-hidden />
                Ansehen
              </Link>
            </Button>
            <Button onClick={() => onOpenChange(false)}>Fertig</Button>
          </div>
        </div>
      ) : (
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <WizardLayout
            className="min-h-[26rem]"
            aside={
              <>
                <p className="eyebrow">Neue Mitteilung</p>
                <WizardProgress count={wizard.count} index={wizard.index} label={STEPS[wizard.index].label} />
                <WizardSummary rows={rows} activeKey={wizard.step} onSelect={goTo} className="-mx-3 hidden md:block" />
              </>
            }
          >
            <fieldset disabled={isPending} className="min-w-0">
              <WizardStep {...stepProps("title")} title="Worum geht es?">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      next("title");
                    }
                  }}
                  maxLength={MAX_TITLE}
                  placeholder="z. B. Neues Semester, neue Ressortleitungen"
                  aria-label="Betreff"
                  autoFocus
                  className="h-12 text-base"
                />
                {errorLine}
                <WizardNav>
                  <Button type="button" size="lg" onClick={() => next("title")}>
                    Weiter
                    <ArrowRight aria-hidden />
                  </Button>
                </WizardNav>
              </WizardStep>

              <WizardStep {...stepProps("content")} title="Was möchtest du mitteilen?">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  maxLength={MAX_CONTENT}
                  aria-label="Text"
                  placeholder="Deine Nachricht an alle Mitglieder …"
                  className="flex w-full rounded-xs border border-input bg-card px-3 py-2.5 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 md:text-sm"
                />
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {content.length.toLocaleString("de-DE")} / {MAX_CONTENT.toLocaleString("de-DE")}
                </p>
                {errorLine}
                <WizardNav onBack={() => goTo("title")}>
                  <Button type="button" size="lg" onClick={() => next("content")}>
                    Weiter
                    <ArrowRight aria-hidden />
                  </Button>
                </WizardNav>
              </WizardStep>

              <WizardStep {...stepProps("preview")} title="Alles richtig?">
                <WizardPreview label="So sehen Mitglieder die Mitteilung">
                  <NewsCard id="vorschau" title={title.trim()} content={content.trim()} author={authorName} date={today} />
                </WizardPreview>
                {errorLine}
                <WizardNav onBack={() => goTo("content")}>
                  <Button type="button" size="lg" onClick={publish} disabled={isPending}>
                    {isPending ? "Wird veröffentlicht…" : "Veröffentlichen"}
                  </Button>
                </WizardNav>
              </WizardStep>
            </fieldset>
          </WizardLayout>
        </form>
      )}
    </WizardDialog>
  );
}
