"use client";

import { motion, useAnimationControls } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { Settings } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

type SettingsNavIconProps = {
  className?: string;
  isRowHovered: boolean;
};

/**
 * Settings gear: spins once on row hover, snaps back instantly on leave
 * (avoids framer-motion reversing keyframes on hover exit).
 */
export function SettingsNavIcon({
  className,
  isRowHovered,
}: SettingsNavIconProps) {
  const controls = useAnimationControls();
  const prefersReducedMotion = useReducedMotionSafe();

  useEffect(() => {
    if (prefersReducedMotion) return;

    if (!isRowHovered) {
      controls.stop();
      controls.set({ rotate: 0, scale: 1 });
      return;
    }

    let cancelled = false;

    void controls
      .start({
        rotate: [0, 360],
        scale: [1, 1.12, 1],
        transition: {
          rotate: { duration: 0.63, ease: "easeInOut" },
          scale: {
            duration: 0.63,
            ease: "easeInOut",
            times: [0, 0.45, 1],
          },
        },
      })
      .then(() => {
        if (!cancelled) {
          controls.set({ rotate: 0, scale: 1 });
        }
      });

    return () => {
      cancelled = true;
      controls.stop();
      controls.set({ rotate: 0, scale: 1 });
    };
  }, [isRowHovered, controls, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      <span className={cn("inline-flex", className)} aria-hidden>
        <Settings className="h-5 w-5" strokeWidth={2} />
      </span>
    );
  }

  return (
    <motion.span
      animate={controls}
      style={{ transformOrigin: "50% 50%" }}
      className={cn("inline-flex", className)}
      aria-hidden
    >
      <Settings className="h-5 w-5" strokeWidth={2} />
    </motion.span>
  );
}
