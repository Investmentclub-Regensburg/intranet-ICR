"use client";

import {
  motion,
  useAnimationControls,
} from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

type BoardMembersNavIconProps = {
  className?: string;
  isRowHovered: boolean;
};

const SHOULDER = { x: 17.75, y: 15.65 };
const ELBOW = { x: 20.15, y: 12.6 };
const HAND = { x: 22.1, y: 7.6 };
const ARM_PATH = `M${SHOULDER.x} ${SHOULDER.y} C19.1 14.1 19.7 13.2 ${ELBOW.x} ${ELBOW.y} C20.6 10.8 21.4 9.1 ${HAND.x} ${HAND.y}`;
const ARM_STROKE_WIDTH = 2.75;

const ARM_HIDDEN = {
  pathLength: 0,
  rotate: 0,
  opacity: 0,
  visibility: "hidden" as const,
};

/**
 * Single person that briefly comes alive on row hover:
 * subtle bob, head tilt, arm grows from the shoulder, waves, then retracts.
 */
export function BoardMembersNavIcon({
  className,
  isRowHovered,
}: BoardMembersNavIconProps) {
  const figureControls = useAnimationControls();
  const headControls = useAnimationControls();
  const armControls = useAnimationControls();
  const prefersReducedMotion = useReducedMotionSafe();

  useEffect(() => {
    if (prefersReducedMotion) return;

    if (!isRowHovered) {
      figureControls.stop();
      headControls.stop();
      armControls.stop();
      figureControls.set({ y: 0, scale: 1 });
      headControls.set({ rotate: 0 });
      armControls.set(ARM_HIDDEN);
      return;
    }

    let cancelled = false;

    async function playWave() {
      armControls.set(ARM_HIDDEN);

      void figureControls.start({
        y: [0, -2, -0.5, 0],
        scale: [1, 1.035, 1.01, 1],
        transition: { duration: 0.95, ease: "easeOut" },
      });

      void headControls.start({
        rotate: [0, 4, 1, 4, 0],
        transition: { duration: 0.9, ease: "easeInOut" },
      });

      await armControls.start({
        opacity: 1,
        visibility: "visible",
        pathLength: 1,
        rotate: -4,
        transition: {
          visibility: { duration: 0 },
          opacity: { duration: 0.06 },
          pathLength: { duration: 0.34, ease: [0.33, 1, 0.68, 1] },
          rotate: { duration: 0.34, ease: [0.33, 1, 0.68, 1] },
        },
      });

      if (cancelled) return;

      await armControls.start({
        rotate: [-5, -30, -3, -24, -5],
        transition: { duration: 0.56, ease: "easeInOut" },
      });

      if (cancelled) return;

      await armControls.start({
        pathLength: 0,
        rotate: 6,
        opacity: 0,
        visibility: "hidden",
        transition: {
          pathLength: { duration: 0.36, ease: [0.4, 0, 0.2, 1] },
          rotate: { duration: 0.36, ease: [0.4, 0, 0.2, 1] },
          opacity: { duration: 0.1, delay: 0.26 },
          visibility: { delay: 0.36, duration: 0 },
        },
      });
    }

    void playWave();

    return () => {
      cancelled = true;
      figureControls.stop();
      headControls.stop();
      armControls.stop();
      figureControls.set({ y: 0, scale: 1 });
      headControls.set({ rotate: 0 });
      armControls.set(ARM_HIDDEN);
    };
  }, [
    isRowHovered,
    figureControls,
    headControls,
    armControls,
    prefersReducedMotion,
  ]);

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
      <motion.g animate={figureControls} initial={{ y: 0, scale: 1 }}>
        <path d="M20 21a8 8 0 0 0-16 0" />

        <motion.g
          animate={headControls}
          initial={{ rotate: 0 }}
          style={{ transformOrigin: "12px 8px" }}
        >
          <circle cx="12" cy="8" r="5" />
        </motion.g>

        {!prefersReducedMotion ? (
          <motion.path
            d={ARM_PATH}
            strokeWidth={ARM_STROKE_WIDTH}
            strokeLinecap="round"
            animate={armControls}
            initial={ARM_HIDDEN}
            style={{
              transformOrigin: `${SHOULDER.x}px ${SHOULDER.y}px`,
              pointerEvents: "none",
            }}
          />
        ) : null}
      </motion.g>
    </svg>
  );
}
