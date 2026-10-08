"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * „Bewegung reduzieren“ des Systems, hydration-sicher: Beim Hydrieren gilt wie auf dem
 * Server `false`, direkt danach der echte Wert. framer-motions useReducedMotion liest
 * schon beim ersten Client-Render und erzeugte bei aktivierter Einstellung einen
 * Hydration-Fehler (Server: animiertes Icon, Client: statisches).
 */
export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
