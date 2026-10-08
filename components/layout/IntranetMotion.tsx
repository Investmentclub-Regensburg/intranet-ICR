"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * „Bewegung reduzieren“ des Systems für alle framer-motion-Animationen im Intranet
 * (Muster Tenant-Dashboard, operator-shell.tsx): Weg- und Größen-Animationen
 * (gleitende Aktiv-Fläche, Tab-Unterstrich, Drawer, Druck-Effekte) springen dann
 * direkt ans Ziel, Ein- und Ausblenden bleibt. Ändert kein Markup, also keine
 * Hydration-Abweichung (anders als bedingtes Rendern über useReducedMotion).
 */
export function IntranetMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
