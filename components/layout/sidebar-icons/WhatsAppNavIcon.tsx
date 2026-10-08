"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

import {
  whatsappBubbleVariants,
  whatsappTypingDot1Variants,
  whatsappTypingDot2Variants,
  whatsappTypingDot3Variants,
} from "@/components/layout/nav-icon-motion";

type WhatsAppNavIconProps = {
  className?: string;
};

const BUBBLE_PATH =
  "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719";

const TYPING_DOTS = [
  { id: "dot-1", cx: 8.75, cy: 11, variants: whatsappTypingDot1Variants },
  { id: "dot-2", cx: 12, cy: 11, variants: whatsappTypingDot2Variants },
  { id: "dot-3", cx: 15.25, cy: 11, variants: whatsappTypingDot3Variants },
] as const;

const DOT_RADIUS = 1.35;

/**
 * Message bubble with three typing dots that bounce in sequence on hover,
 * matching the familiar WhatsApp typing indicator.
 * Bubble path matches lucide-react `MessageCircle`.
 */
export function WhatsAppNavIcon({ className }: WhatsAppNavIconProps) {
  const prefersReducedMotion = useReducedMotionSafe();

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
      className={className}
      aria-hidden
    >
      {prefersReducedMotion ? (
        <path d={BUBBLE_PATH} />
      ) : (
        <motion.g
          variants={whatsappBubbleVariants}
          style={{ transformOrigin: "12px 11px", transformBox: "fill-box" }}
        >
          <path d={BUBBLE_PATH} />
        </motion.g>
      )}
      {TYPING_DOTS.map((dot) =>
        prefersReducedMotion ? (
          <g key={dot.id}>
            <circle
              cx={dot.cx}
              cy={dot.cy}
              r={DOT_RADIUS}
              fill="currentColor"
              stroke="none"
            />
          </g>
        ) : (
          <motion.g key={dot.id} variants={dot.variants}>
            <circle
              cx={dot.cx}
              cy={dot.cy}
              r={DOT_RADIUS}
              fill="currentColor"
              stroke="none"
            />
          </motion.g>
        )
      )}
    </svg>
  );
}
