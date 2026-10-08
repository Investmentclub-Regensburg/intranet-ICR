"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { ArrowUpRight, GraduationCap, KeyRound, TrendingUp, UserPlus, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASH_FOCUS, DASH_TILE, TileIn } from "./parts";
import type { AdminCounts } from "./types";

const MotionLink = motion.create(Link);

type StatItem = {
  key: string;
  value: number;
  label: string;
  meta: string;
  href: string;
  Icon: LucideIcon;
  /** Offene Vorgänge: Zahl > 0 in Rot. */
  attention?: boolean;
};

/** Verwaltung (admin/board): Zahl groß, Bezeichnung, Link in den Admin-Bereich. */
export function AdminStatTiles({ counts }: { counts: AdminCounts }) {
  const items: StatItem[] = [
    {
      key: "applicants",
      value: counts.applicants,
      label: "Mitgliedsanträge",
      meta: "offen",
      href: "/admin/members",
      Icon: UserPlus,
      attention: true,
    },
    {
      key: "alumni",
      value: counts.alumniRequests,
      label: "Alumni-Anträge",
      meta: "offen",
      href: "/admin/alumni-requests",
      Icon: GraduationCap,
      attention: true,
    },
    {
      key: "bvh",
      value: counts.bvhRequests,
      label: "BVH-Anfragen",
      meta: "offen",
      href: "/admin/bvh-login",
      Icon: KeyRound,
      attention: true,
    },
    {
      key: "active",
      value: counts.activeMembers,
      label: "Aktive Mitglieder",
      meta: "ohne Alumni",
      href: "/admin/members",
      Icon: Users,
    },
    {
      key: "new",
      value: counts.newThisSemester,
      label: "Neuzugänge",
      meta: counts.semesterLabel,
      href: "/admin/members",
      Icon: TrendingUp,
    },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @xl:gap-4 @4xl:grid-cols-5">
        {items.map(({ key, value, label, meta, href, Icon, attention }, i) => {
          const hot = attention && value > 0;
          return (
            // Fünfte Kachel füllt auf dem Handy (zwei Spalten) die letzte Zeile.
            <TileIn key={key} index={i} className={i === items.length - 1 ? "col-span-2 @xl:col-span-1" : undefined}>
              <MotionLink
                href={href}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={cn(DASH_TILE, DASH_FOCUS, "flex h-full flex-col gap-5 p-4 sm:p-5")}
              >
                <span className="flex items-start justify-between">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-tint text-primary">
                    <Icon className="size-[1.125rem]" aria-hidden />
                  </span>
                  <ArrowUpRight
                    className="size-4 text-muted-foreground transition-[translate,color] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </span>
                <span className="mt-auto block">
                  <span
                    className={cn(
                      "block text-[2rem] leading-none font-bold tracking-[-0.04em] tabular-nums",
                      hot ? "text-primary" : "text-foreground",
                    )}
                  >
                    {value}
                  </span>
                  <span className="mt-2 block text-sm leading-tight font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{meta}</span>
                </span>
              </MotionLink>
            </TileIn>
          );
        })}
      </div>
    </MotionConfig>
  );
}
