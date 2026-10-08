"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

import {
  membersBackVariants,
  membersFrontVariants,
} from "@/components/layout/nav-icon-motion";

type MembersNavIconProps = {
  className?: string;
};

/**
 * Users icon: front person bounces up first, then the one behind follows
 * in a gentle wave. Paths match lucide-react `Users`.
 */
export function MembersNavIcon({ className }: MembersNavIconProps) {
  const prefersReducedMotion = useReducedMotionSafe();

  if (prefersReducedMotion) {
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
        <path d="M16 3.128a4 4 0 0 1 0 7.744" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </svg>
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
      className={className}
      aria-hidden
    >
      <motion.g variants={membersBackVariants}>
        <path d="M16 3.128a4 4 0 0 1 0 7.744" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </motion.g>
      <motion.g variants={membersFrontVariants}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
      </motion.g>
    </svg>
  );
}
