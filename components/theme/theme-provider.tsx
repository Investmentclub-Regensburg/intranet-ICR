"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// Immer hell wie die Website (Entscheidung Hannes 2026-10-08): kein Dunkelmodus,
// auch nicht über die Systemeinstellung. next-themes bleibt, damit Sonner & Co.
// ein festes Theme lesen.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      forcedTheme="light"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
