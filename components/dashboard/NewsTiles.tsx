"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DASH_FOCUS, DASH_TILE, TileIn } from "./parts";
import type { DashboardNewsItem } from "./types";

const MotionLink = motion.create(Link);

/** Neueste News: Datum, Titel, zwei Zeilen Text. Ungelesene mit roter Kante und „Neu“. */
export function NewsTiles({ items }: { items: DashboardNewsItem[] }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-1 gap-3">
        {items.map((item, i) => (
          <TileIn key={item.id} index={i}>
            <MotionLink
              href="/news"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.995 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={cn(DASH_TILE, DASH_FOCUS, "block overflow-hidden px-5 py-4")}
            >
              {item.unread && (
                <span aria-hidden className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-primary" />
              )}
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <time dateTime={item.createdAt}>{item.dateLabel}</time>
                {item.unread && (
                  <span className="rounded-full bg-brand-tint px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-primary uppercase">
                    Neu
                  </span>
                )}
              </span>
              <span className="mt-1 line-clamp-2 text-base leading-snug font-bold tracking-[-0.02em]">
                {item.title}
              </span>
              {item.excerpt && (
                <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</span>
              )}
            </MotionLink>
          </TileIn>
        ))}
      </div>
    </MotionConfig>
  );
}
