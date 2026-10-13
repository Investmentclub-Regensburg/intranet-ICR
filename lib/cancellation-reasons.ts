/**
 * Kündigungsgründe (freiwillige Angabe beim Kündigen). Schlüssel identisch mit der Datenbank-Prüfung in
 * membership_cancellations und der Mail-Funktion notify-board.
 */
export const CANCELLATION_REASONS = [
  { value: "studium_beendet", label: "Studium beendet / Wegzug" },
  { value: "keine_zeit", label: "Keine Zeit mehr" },
  { value: "zu_wenig_inhalte", label: "Zu wenig Inhalte / Angebote" },
  { value: "inhalte_passen_nicht", label: "Inhalte/Events passen nicht zu mir" },
  { value: "beitrag", label: "Mitgliedsbeitrag" },
  { value: "anderes_angebot", label: "Wechsel zu anderem Verein/Angebot" },
  { value: "sonstiges", label: "Sonstiges" },
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number]["value"];

export const CANCELLATION_TEXT_MAX = 500;

export function isCancellationReason(value: unknown): value is CancellationReason {
  return typeof value === "string" && CANCELLATION_REASONS.some((r) => r.value === value);
}

export function cancellationReasonLabel(value: string | null | undefined): string {
  return CANCELLATION_REASONS.find((r) => r.value === value)?.label ?? "Nicht angegeben";
}
