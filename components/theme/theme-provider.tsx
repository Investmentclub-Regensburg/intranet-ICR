"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// Hell, Dunkel oder wie das System (Standard). next-themes setzt die Klasse auf
// <html> und merkt sich die Wahl im localStorage; Umschalter in der Sidebar
// (components/theme/theme-toggle.tsx). Die Auth-Seiten bleiben hell (.light).
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
