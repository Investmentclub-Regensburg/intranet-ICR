"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  eventsBurstWaveVariants,
  eventsDotBottomRightVariants,
  eventsDotRightVariants,
  eventsDotTopLeftVariants,
  eventsDotTopVariants,
  eventsStreamerVariants,
} from "@/components/layout/nav-icon-motion";

type EventsNavIconProps = {
  className?: string;
};

/** Lucide party-popper paths – unchanged geometry */
const POPPER_BASE = "M5.8 11.3 2 22l10.7-3.79";
const POPPER_CONE_TOP =
  "m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10";
const POPPER_CONE_BOTTOM =
  "m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17";
const STREAMER = "m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7";
const BURST_SHAPE =
  "M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z";

type AnimatedPart = {
  id: string;
  d: string;
  origin: string;
  variants: typeof eventsDotTopLeftVariants;
};

const ANIMATED_PARTS: AnimatedPart[] = [
  {
    id: "streamer",
    d: STREAMER,
    origin: "11px 4px",
    variants: eventsStreamerVariants,
  },
  {
    id: "burst",
    d: BURST_SHAPE,
    origin: "11px 13px",
    variants: eventsBurstWaveVariants,
  },
  {
    id: "dot-tl",
    d: "M4 3h.01",
    origin: "4px 3px",
    variants: eventsDotTopLeftVariants,
  },
  {
    id: "dot-top",
    d: "M15 2h.01",
    origin: "15px 2px",
    variants: eventsDotTopVariants,
  },
  {
    id: "dot-right",
    d: "M22 8h.01",
    origin: "22px 8px",
    variants: eventsDotRightVariants,
  },
  {
    id: "dot-br",
    d: "M22 20h.01",
    origin: "22px 20px",
    variants: eventsDotBottomRightVariants,
  },
];

/**
 * Original party-popper icon; confetti elements flow in a staggered wave on hover.
 */
export function EventsNavIcon({ className }: EventsNavIconProps) {
  const prefersReducedMotion = useReducedMotionSafe();

  if (prefersReducedMotion) {
    return (
      <PartyPopper className={cn(className)} strokeWidth={2} aria-hidden />
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="visible"
      className={cn(className)}
      aria-hidden
    >
      <g>
        <path d={POPPER_BASE} />
        <path d={POPPER_CONE_TOP} />
        <path d={POPPER_CONE_BOTTOM} />
      </g>

      {ANIMATED_PARTS.map((part) => (
        <motion.g
          key={part.id}
          variants={part.variants}
          style={{ transformOrigin: part.origin }}
        >
          <path d={part.d} />
        </motion.g>
      ))}
    </svg>
  );
}
