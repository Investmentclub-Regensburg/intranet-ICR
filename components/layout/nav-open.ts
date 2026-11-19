// Aufklappen in der Seitenleiste (Design-Runde 19.11.2026, Skizze Main.dc.html): Bereiche mit
// Unterseiten navigieren nicht mehr, ein Klick klappt sie nur auf oder zu. Immer ist höchstens ein
// Bereich offen; nach jeder Navigation (auch erstes Laden, Zurück/Vor) der Bereich der aktuellen
// Seite. Die Nutzerzeile („Mein Profil“) zählt als eigener Bereich. Ohne Hooks, daher testbar.

/** Schlüssel des Profil-Bereichs (Nutzerzeile unten). */
export const PROFILE_SECTION = "profile";

export type OpenableSection = {
  key: string;
  /** Pfade (Präfix), auf denen der Bereich die aktuelle Seite hält. */
  paths: string[];
};

/** Liegt der Pfad auf einem der Präfixe (genau oder darunter)? */
export function pathMatches(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"));
}

/** Bereich, der die aktuelle Seite hält (erster Treffer), sonst null. */
export function sectionForPath(pathname: string, sections: OpenableSection[]): string | null {
  return sections.find((s) => pathMatches(pathname, s.paths))?.key ?? null;
}

/** Klick auf einen Bereich: offen → zu, sonst nur dieser offen (der vorige schließt). */
export function toggleSection(open: string | null, key: string): string | null {
  return open === key ? null : key;
}
