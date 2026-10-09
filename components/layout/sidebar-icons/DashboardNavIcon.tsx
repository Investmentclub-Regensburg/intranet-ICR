"use client";

import { motion } from "framer-motion";
import {
  dashboardTileBottomLeftVariants,
  dashboardTileBottomRightVariants,
  dashboardTileTopLeftVariants,
  dashboardTileTopRightVariants,
} from "@/components/layout/nav-icon-motion";

type DashboardNavIconProps = {
  className?: string;
};

/**
 * Übersicht: die vier Kacheln fliegen beim Hover kurz nach außen und kehren zurück.
 * Formen wie lucide-react `LayoutDashboard`.
 */
export function DashboardNavIcon({ className }: DashboardNavIconProps) {
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
      <motion.rect variants={dashboardTileTopLeftVariants} width="7" height="9" x="3" y="3" rx="1" />
      <motion.rect variants={dashboardTileTopRightVariants} width="7" height="5" x="14" y="3" rx="1" />
      <motion.rect variants={dashboardTileBottomRightVariants} width="7" height="9" x="14" y="12" rx="1" />
      <motion.rect variants={dashboardTileBottomLeftVariants} width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}
