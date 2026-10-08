"use client";

import { motion } from "framer-motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNavIconTransformOrigin,
  getNavIconVariants,
} from "@/components/layout/nav-icon-motion";
import { InsightsNavIcon } from "@/components/layout/sidebar-icons/InsightsNavIcon";
import { BoardMembersNavIcon } from "@/components/layout/sidebar-icons/BoardMembersNavIcon";
import { CalendarNavIcon } from "@/components/layout/sidebar-icons/CalendarNavIcon";
import { EventsNavIcon } from "@/components/layout/sidebar-icons/EventsNavIcon";
import { MembersNavIcon } from "@/components/layout/sidebar-icons/MembersNavIcon";
import { SettingsNavIcon } from "@/components/layout/sidebar-icons/SettingsNavIcon";
import { WhatsAppNavIcon } from "@/components/layout/sidebar-icons/WhatsAppNavIcon";

type SidebarNavIconProps = {
  href: string;
  icon: LucideIcon;
  active: boolean;
  isRowHovered: boolean;
};

type CustomNavIconProps = {
  className?: string;
};

const CUSTOM_NAV_ICONS: Record<string, ComponentType<CustomNavIconProps>> = {
  "/events": EventsNavIcon,
  "/insights": InsightsNavIcon,
  "/members": MembersNavIcon,
  "/whatsapp": WhatsAppNavIcon,
};

function iconColorClass(active: boolean): string {
  return active ? "text-white" : "text-sidebar-muted group-hover:text-sidebar-primary";
}

const iconShellClass =
  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-visible";

export function SidebarNavIcon({
  href,
  icon: Icon,
  active,
  isRowHovered,
}: SidebarNavIconProps) {
  const prefersReducedMotion = useReducedMotionSafe();
  const colorClass = iconColorClass(active);
  const CustomIcon = CUSTOM_NAV_ICONS[href];

  if (href === "/admin") {
    return (
      <span className={cn(iconShellClass, colorClass)} aria-hidden="true">
        <SettingsNavIcon className="h-5 w-5" isRowHovered={isRowHovered} />
      </span>
    );
  }

  if (href === "/calendar") {
    return (
      <span className={cn(iconShellClass, colorClass)} aria-hidden="true">
        <CalendarNavIcon className="h-5 w-5" isRowHovered={isRowHovered} />
      </span>
    );
  }

  if (href === "/board-members") {
    return (
      <span className={cn(iconShellClass, colorClass)} aria-hidden="true">
        <BoardMembersNavIcon
          className="h-5 w-5"
          isRowHovered={isRowHovered}
        />
      </span>
    );
  }

  if (CustomIcon) {
    if (prefersReducedMotion) {
      return (
        <span className={cn(iconShellClass, colorClass)} aria-hidden="true">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      );
    }

    return (
      <span className={cn(iconShellClass, colorClass)} aria-hidden="true">
        <CustomIcon className="h-5 w-5" />
      </span>
    );
  }

  if (prefersReducedMotion) {
    return (
      <span className={cn(iconShellClass, colorClass)} aria-hidden="true">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
    );
  }

  const variants = getNavIconVariants(href);
  const transformOrigin = getNavIconTransformOrigin(href);

  return (
    <motion.span
      variants={variants}
      style={{ transformOrigin }}
      className={cn(iconShellClass, colorClass)}
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" strokeWidth={2} />
    </motion.span>
  );
}
