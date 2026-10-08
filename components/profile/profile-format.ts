/**
 * Anzeige-Helfer für „Mein Profil“ (nur Formatierung, keine Datenzugriffe).
 * Läuft auf dem Server: Datumswerte werden dort fertig formatiert an die Client-
 * Komponenten gegeben, damit Server- und Browser-Zeitzone nichts verschieben.
 */

const TIME_ZONE = "Europe/Berlin";

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  alumni: "Alumni",
  board: "Vorstand",
  member: "Mitglied",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Aktiv",
  alumni: "Alumni",
  applicant: "Bewerber",
  cancelled: "Gekündigt",
  inactive: "Inaktiv",
};

/** "12.03.2024" oder null, wenn kein gültiges Datum. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

/** "2 Jahre, 7 Monate", "unter 1 Monat" oder null. */
export function membershipDuration(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const joined = new Date(iso);
  if (Number.isNaN(joined.getTime())) return null;

  let years = now.getFullYear() - joined.getFullYear();
  let months = now.getMonth() - joined.getMonth();
  if (now.getDate() < joined.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return null;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "Jahr" : "Jahre"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "Monat" : "Monate"}`);
  return parts.length > 0 ? parts.join(", ") : "unter 1 Monat";
}

/** IBAN für die Lesesicht: nur die letzten 4 Stellen. */
export function maskIban(iban: string): string {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (!clean) return "";
  return `•••• •••• •••• ${clean.slice(-4)}`;
}

/** Initialen für den Avatar ("Max Mustermann" → "MM"). */
export function initials(vorname: string, nachname: string): string {
  const a = vorname.trim().charAt(0);
  const b = nachname.trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

export type FeeStop = {
  /** z. B. "SoSe 2027" oder "WiSe 2027/28" */
  semester: string;
  /** Stichtag, z. B. "15.03.2027" */
  stichtag: string;
};

/**
 * Ab welchem Semester nach einer Kündigung heute kein Beitrag mehr eingezogen wird.
 * Gleiche Stichtage wie der Finanzexport (getPeriodStart in
 * app/(intranet)/admin/actions/finance.ts): SoSe ab 15.03., WiSe ab 01.10.; wer vor
 * dem Stichtag gekündigt hat, fällt aus dem Einzug dieses Semesters heraus. Gesucht
 * ist also der erste Stichtag nach heute.
 */
export function nextFeeStop(now = new Date()): FeeStop {
  const y = now.getFullYear();
  const candidates: { start: Date; semester: string }[] = [
    { start: new Date(y, 2, 15), semester: `SoSe ${y}` },
    { start: new Date(y, 9, 1), semester: `WiSe ${y}/${String((y + 1) % 100).padStart(2, "0")}` },
    { start: new Date(y + 1, 2, 15), semester: `SoSe ${y + 1}` },
  ];
  const next = candidates.find((c) => now < c.start) ?? candidates[candidates.length - 1];
  return {
    semester: next.semester,
    stichtag: next.start.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
  };
}
