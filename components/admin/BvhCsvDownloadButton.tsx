"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/IconButton";
import { buildBvhUnhandledRequestsCsv } from "@/app/(intranet)/magazines/actions";

type Props = {
  unhandledCount: number;
};

/** CSV der offenen Anfragen für den Upload auf der BVH-Seite (nur Vorstand, die Action prüft selbst). */
export function BvhCsvDownloadButton({ unhandledCount }: Props) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const { csv, error } = await buildBvhUnhandledRequestsCsv();
      if (error || csv == null) {
        toast.error(error || "Export fehlgeschlagen.");
        return;
      }
      const bom = "﻿";
      const blob = new Blob([bom + csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `bvh-mitglieder-upload-${day}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        unhandledCount === 0
          ? "Vorlage heruntergeladen (keine offenen Anfragen)."
          : "CSV wurde heruntergeladen."
      );
    } catch {
      toast.error("Download fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <IconButton
      label="CSV der offenen Anfragen für die BVH-Seite laden"
      variant="outline"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Download />}
    </IconButton>
  );
}
