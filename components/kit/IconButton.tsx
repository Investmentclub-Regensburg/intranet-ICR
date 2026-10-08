"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

// Icon-Aktion nach dem Muster OpIconButton (Tenant-Dashboard, _components/ui.tsx):
// nur ein lucide-Icon, Bedeutung über aria-label + title, kleiner Druck-Effekt.
// Standard für Bearbeiten (Pencil), Löschen (Trash2), Hinzufügen (Plus) usw.
// in Kacheln und Zeilen, statt Text-Buttons.

export type IconButtonVariant = "ghost" | "outline" | "primary" | "danger";

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  outline: "border border-input bg-card text-foreground hover:border-primary/35 hover:bg-accent",
  primary: "bg-primary text-primary-foreground shadow-brand hover:bg-brand-hover dark:hover:bg-primary/90",
  danger: "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
};

const BASE =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-xs transition-colors " +
  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 " +
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

/** Button-Attribute, die zusätzlich durchgereicht werden (aria-*, id, data-* …), ohne die
 *  Event-Props, die framer-motion anders typisiert. */
type Rest = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "children"
  | "className"
  | "type"
  | "disabled"
  | "onClick"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
>;

export function IconButton({
  label,
  variant = "ghost",
  className,
  type = "button",
  disabled,
  onClick,
  children,
  ref,
  ...rest
}: Rest & {
  /** Pflicht: wird aria-label und Tooltip. */
  label: string;
  variant?: IconButtonVariant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <motion.button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className={cn(BASE, VARIANTS[variant], className)}
    >
      {children}
    </motion.button>
  );
}

const MotionLink = motion.create(Link);

/** Dieselbe Icon-Aktion als Link (z. B. Bearbeiten-Seite öffnen). */
export function IconLink({
  href,
  label,
  variant = "ghost",
  className,
  children,
  external = false,
}: {
  href: string;
  label: string;
  variant?: IconButtonVariant;
  className?: string;
  children: ReactNode;
  /** Öffnet in neuem Tab (z. B. LinkedIn, WhatsApp). */
  external?: boolean;
}) {
  return (
    <MotionLink
      href={href}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.9 }}
      className={cn(BASE, VARIANTS[variant], className)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </MotionLink>
  );
}
