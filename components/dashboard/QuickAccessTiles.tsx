"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { BookOpen, CalendarDays, CircleUserRound, MessageCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASH_FOCUS, DASH_TILE, TileIn } from "./parts";

const MotionLink = motion.create(Link);

type QuickItem = { href: string; label: string; meta: string; Icon: LucideIcon };

/** Schnellzugriff: kleine Icon-Kacheln (Zeitschriften, WhatsApp, Kalender, Profil). */
export function QuickAccessTiles({ magazinesMeta, monthLabel }: { magazinesMeta: string; monthLabel: string }) {
  const items: QuickItem[] = [
    { href: "/magazines", label: "Zeitschriften", meta: magazinesMeta, Icon: BookOpen },
    { href: "/whatsapp", label: "WhatsApp-Gruppe", meta: "Gruppe beitreten", Icon: MessageCircle },
    { href: "/calendar", label: "Kalender", meta: monthLabel, Icon: CalendarDays },
    { href: "/profile", label: "Profil", meta: "Daten und Mitgliedschaft", Icon: CircleUserRound },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4 @2xl:gap-4">
        {items.map(({ href, label, meta, Icon }, i) => (
          <TileIn key={href} index={i}>
            <MotionLink
              href={href}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={cn(DASH_TILE, DASH_FOCUS, "flex h-full flex-col gap-3 p-4")}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-tint text-primary">
                <Icon
                  className="size-5 transition-transform duration-500 ease-out group-hover:-rotate-8 group-hover:scale-110"
                  aria-hidden
                />
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-tight font-bold tracking-[-0.01em]">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>
              </span>
            </MotionLink>
          </TileIn>
        ))}
      </div>
    </MotionConfig>
  );
}
