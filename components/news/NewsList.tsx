"use client";

import { useState } from "react";
import { staggerProps } from "@/components/kit/Reveal";
import { NewsCard } from "./NewsCard";

export type NewsListItem = {
  id: string;
  title: string;
  content: string;
  author: string;
  /** ISO-Zeitstempel für den Vergleich mit dem letzten Besuch. */
  createdAt: string;
  /** Fertig formatiert (Berlin), z. B. "8. Oktober 2026". */
  date: string;
};

/**
 * Liste der Mitteilungen. Der Zeitpunkt des letzten Besuchs wird beim ersten Rendern
 * festgehalten: Die Seite markiert beim Öffnen alles als gelesen (und lädt danach neu),
 * die Markierung „Neu“ soll trotzdem für diesen Besuch stehen bleiben.
 */
export function NewsList({
  items,
  lastReadAt,
  canDelete,
}: {
  items: NewsListItem[];
  lastReadAt: string | null;
  canDelete: boolean;
}) {
  const [since] = useState(() => {
    const t = lastReadAt ? Date.parse(lastReadAt) : Number.NaN;
    return Number.isNaN(t) ? null : t;
  });

  return (
    <div {...staggerProps()} className="max-w-3xl space-y-4">
      {items.map((item) => {
        const created = Date.parse(item.createdAt);
        const unread = since === null || (!Number.isNaN(created) && created > since);
        return (
          <NewsCard
            key={item.id}
            id={item.id}
            title={item.title}
            content={item.content}
            author={item.author}
            date={item.date}
            unread={unread}
            canDelete={canDelete}
          />
        );
      })}
    </div>
  );
}
