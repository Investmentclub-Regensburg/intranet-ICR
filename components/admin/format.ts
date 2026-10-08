// Formatierer für den Bereich „Verwaltung“ (Server und Client).

/** Datum (ISO oder YYYY-MM-DD) als TT.MM.JJJJ, reine Daten ohne Zeitzonen-Verschiebung. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "–";
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return `${plain[3]}.${plain[2]}.${plain[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

/** Zeitpunkt als „TT.MM.JJJJ, HH:MM“ in Berliner Zeit. */
export function formatMoment(value: string | null | undefined): string {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export const ROLE_LABELS: Record<string, string> = {
  member: "Mitglied",
  admin: "Admin",
  board: "Vorstand",
  alumni: "Alumni",
  cancelled: "Ausgetreten",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Aktiv",
  applicant: "Antrag offen",
  cancelled: "Ausgetreten",
  alumni: "Alumni",
};

/** Einzahl/Mehrzahl: plural(1, "Antrag", "Anträge") → "1 Antrag". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Statusgruppe für Filter und Pille: ausgetreten, Antrag offen oder aktiv (inkl. Alumni). */
export function statusGroup(m: { status: string }): "active" | "applicant" | "cancelled" {
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "applicant") return "applicant";
  return "active";
}
