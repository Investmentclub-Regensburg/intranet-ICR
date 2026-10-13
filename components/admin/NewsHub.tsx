"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Megaphone, PenLine, Plus, Trash2, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { IconButton, IconLink } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { AddTile, Tile, TileGrid } from "@/components/kit/Tile";
import { deleteNews } from "@/app/(intranet)/news/actions";
import { ChoiceTiles } from "@/components/kit/ChoiceTiles";
import { RevealHeading } from "@/components/kit/Reveal";
import { ConfirmDialog } from "./bits";
import { formatDay } from "./format";
import { NewsWizard } from "./NewsWizard";

export type AdminNewsItem = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author: string;
};

/** Schwarzes Brett in der Verwaltung: erst wählen, dann Wizard oder Liste. */
export function NewsHub({
  view,
  news,
  authorName,
}: {
  view: "choose" | "manage";
  news: AdminNewsItem[];
  authorName: string;
}) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [toDelete, setToDelete] = useState<AdminNewsItem | null>(null);

  function openWizard() {
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
  }

  async function remove(): Promise<string> {
    if (!toDelete) return "";
    const { error } = await deleteNews(toDelete.id);
    if (error) return error;
    toast.success("Mitteilung entfernt.");
    router.refresh();
    return "";
  }

  return (
    <>
      {view === "choose" ? (
        <div className="space-y-6">
          <ChoiceTiles
            ariaLabel="Was möchtest du tun?"
            items={[
              {
                key: "neu",
                Icon: PenLine,
                title: "Neue Mitteilung",
                text: "Betreff, Text, Vorschau, fertig. Alle Mitglieder sehen sie am Schwarzen Brett.",
                meta: "Dauert etwa eine Minute",
                onSelect: openWizard,
                primary: true,
              },
              {
                key: "verwalten",
                Icon: LayoutList,
                title: "Mitteilungen verwalten",
                text: "Ältere Mitteilungen ansehen und entfernen.",
                meta: `${news.length} ${news.length === 1 ? "Mitteilung" : "Mitteilungen"}`,
                href: "/admin/news?ansicht=verwalten",
              },
            ]}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <RevealHeading className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <IconLink href="/admin/news" label="Zurück zur Auswahl" variant="outline">
                <ArrowLeft />
              </IconLink>
              <h1 className="truncate text-xl font-bold tracking-[-0.03em] sm:text-2xl">Mitteilungen verwalten</h1>
            </div>
            <IconButton label="Neue Mitteilung" variant="primary" onClick={openWizard}>
              <Plus />
            </IconButton>
          </RevealHeading>

          {news.length === 0 ? (
            <EmptyState title="Noch keine Mitteilungen." />
          ) : (
            <TileGrid>
              {news.map((n) => (
                <Tile
                  key={n.id}
                  Icon={Megaphone}
                  title={n.title}
                  meta={`${formatDay(n.created_at)} · ${n.author}`}
                  actions={
                    <IconButton label={`${n.title} entfernen`} variant="danger" onClick={() => setToDelete(n)}>
                      <Trash2 />
                    </IconButton>
                  }
                >
                  <p className="line-clamp-3 whitespace-pre-line">{n.content}</p>
                </Tile>
              ))}
              <AddTile label="Neue Mitteilung" onClick={openWizard} />
            </TileGrid>
          )}
        </div>
      )}

      <NewsWizard key={wizardKey} open={wizardOpen} onOpenChange={setWizardOpen} authorName={authorName} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Mitteilung entfernen?"
        description={`„${toDelete?.title ?? ""}“ verschwindet für alle Mitglieder vom Schwarzen Brett.`}
        confirmLabel="Entfernen"
        busyLabel="Wird entfernt…"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
