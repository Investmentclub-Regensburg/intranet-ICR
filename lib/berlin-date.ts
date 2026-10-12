/** Heutiges Datum in Berlin als YYYY-MM-DD (unabhängig von der Zeitzone des Servers). */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
