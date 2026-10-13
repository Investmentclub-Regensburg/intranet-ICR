"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/IconButton";
import { EmptyState } from "@/components/kit/PageHeader";
import { Segmented } from "@/components/kit/Segmented";
import { Tile, TileGrid } from "@/components/kit/Tile";
import { markBvhRequestHandled, type BvhLoginRequestRow } from "@/app/(intranet)/magazines/actions";
import { StatusPill } from "@/components/kit/StatusCard";
import { ConfirmDialog } from "./bits";
import { BvhCsvDownloadButton } from "./BvhCsvDownloadButton";
import { formatDay } from "./format";

/** BVH-Anfragen als Kacheln: offen/erledigt, Abhaken per Icon (admin + board wie bisher). */
export function BvhRequests({ requests, canExport }: { requests: BvhLoginRequestRow[]; canExport: boolean }) {
  const router = useRouter();
  const open = requests.filter((r) => !r.handled);
  const done = requests.filter((r) => r.handled);
  const [filter, setFilter] = useState<"open" | "done">("open");
  const [toHandle, setToHandle] = useState<BvhLoginRequestRow | null>(null);
  const list = filter === "open" ? open : done;

  async function handle(): Promise<string> {
    if (!toHandle) return "";
    const { error } = await markBvhRequestHandled(toHandle.id);
    if (error) return error;
    toast.success("Als erledigt markiert.");
    router.refresh();
    return "";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          layoutId="bvh-filter"
          ariaLabel="Filter"
          options={[
            { key: "open", label: `Offen ${open.length}` },
            { key: "done", label: `Erledigt ${done.length}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {canExport ? (
          <BvhCsvDownloadButton unhandledCount={open.length} />
        ) : (
          <span className="text-xs text-muted-foreground">CSV-Export nur für den Vorstand</span>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "Keine offenen Anfragen." : "Noch nichts erledigt."}
          hint={filter === "open" ? "Mitglieder beantragen den Zugang unter Vorteile." : undefined}
        />
      ) : (
        <TileGrid>
          {list.map((r) => {
            const name = [r.vorname, r.nachname].filter(Boolean).join(" ") || "—";
            return (
              <Tile
                key={r.id}
                Icon={KeyRound}
                title={name}
                meta={r.email || "—"}
                actions={
                  !r.handled ? (
                    <IconButton label={`${name} als erledigt markieren`} variant="outline" onClick={() => setToHandle(r)}>
                      <Check />
                    </IconButton>
                  ) : undefined
                }
                footer={
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden />
                      Angefragt am {formatDay(r.created_at)}
                    </span>
                    {r.handled ? (
                      <StatusPill status="done" />
                    ) : (
                      <StatusPill status="open" />
                    )}
                  </span>
                }
              />
            );
          })}
        </TileGrid>
      )}

      <ConfirmDialog
        open={!!toHandle}
        onOpenChange={(o) => !o && setToHandle(null)}
        title="Als erledigt markieren?"
        description="Freischalten musst du den Zugang selbst auf der BVH-Seite. Das Mitglied sieht seine Anfrage danach als erledigt."
        confirmLabel="Erledigt"
        busyLabel="Wird gespeichert…"
        onConfirm={handle}
      />
    </div>
  );
}
