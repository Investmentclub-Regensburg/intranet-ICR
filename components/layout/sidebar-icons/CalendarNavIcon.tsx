"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type CalendarNavIconProps = {
  className?: string;
  isRowHovered: boolean;
};

function todayDay(): number {
  return new Date().getDate();
}

function randomDayExcept(current: number): number {
  let next = Math.floor(Math.random() * 31) + 1;
  while (current >= 1 && current <= 31 && next === current) {
    next = Math.floor(Math.random() * 31) + 1;
  }
  return next;
}

const dayNumberTransition = {
  duration: 0.48,
  ease: [0.33, 1, 0.68, 1] as const,
};

/**
 * Calendar with a day number that changes to a random date (1–31)
 * on each new row hover, with a smooth vertical crossfade.
 * Outline paths match lucide-react `Calendar`.
 */
export function CalendarNavIcon({
  className,
  isRowHovered,
}: CalendarNavIconProps) {
  const prefersReducedMotion = useReducedMotionSafe();
  const [day, setDay] = useState(todayDay);
  const wasHoveredRef = useRef(false);

  useEffect(() => {
    if (!isRowHovered) {
      wasHoveredRef.current = false;
      return;
    }

    if (wasHoveredRef.current) return;
    wasHoveredRef.current = true;

    setDay((current) => randomDayExcept(current));
  }, [isRowHovered]);

  const fontSize = day >= 10 ? 9.5 : 11.5;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      overflow="hidden"
      className={cn(className)}
      aria-hidden
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />

      {/* Nested SVG clips the day animation without SSR-unstable clipPath ids */}
      <svg
        x="3.5"
        y="10.2"
        width="17"
        height="11.8"
        viewBox="0 0 17 11.8"
        overflow="hidden"
        aria-hidden
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.g
            key={day}
            initial={
              prefersReducedMotion ? false : { y: 9, opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            exit={
              prefersReducedMotion ? undefined : { y: -9, opacity: 0 }
            }
            transition={
              prefersReducedMotion ? { duration: 0 } : dayNumberTransition
            }
          >
            <text
              x="8.5"
              y="6.6"
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight="700"
              fontFamily="var(--font-geist-sans), system-ui, sans-serif"
              fill="currentColor"
              stroke="none"
              dominantBaseline="middle"
            >
              {day}
            </text>
          </motion.g>
        </AnimatePresence>
      </svg>
    </svg>
  );
}
