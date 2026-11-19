// Mitgliederverzeichnis (Verein › Mitglieder): Filtern beim Tippen und Initialen der Kacheln. Rein, ohne I/O,
// getestet in tests/members-directory.test.mjs.

/** Eintrag im Verzeichnis: nur Name und Studiengang. */
export type MemberRow = { name: string; studiengang: string };

/** Einträge, deren Name die Eingabe enthält (Groß-/Kleinschreibung egal, Leerzeichen außen ignoriert). */
export function filtereVerzeichnis<T extends { name: string }>(members: readonly T[], suche: string): T[] {
  const q = suche.trim().toLowerCase();
  if (!q) return [...members];
  return members.filter((m) => m.name.toLowerCase().includes(q));
}

/** Bis zu zwei Anfangsbuchstaben in Großschreibung („Lena Hofmann“ → „LH“). */
export function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
