import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Studiengang eines Mitglieds speichern (Klartext in profiles."Studiengang / Fach"). Nur mit Service Role und nach
 * geprüfter Eingabe (lib/studiengaenge.ts → studiengangAenderung).
 *
 * Datenbankfunktion save_member_studiengang (Migration 20261119120000): Compare-and-set gegen den gelesenen Wert
 * (`erwartet`, profiles hat keine Version) und, nur bei einer Korrektur durch den Vorstand (`correctedBy`), der
 * Protokolleintrag in member_data_corrections (Feld „studiengang“, Quelle „vorstand“, nie Werte) in EINER
 * Transaktion. Ändert das Mitglied seinen Studiengang selbst, gehen Vorstand und Quelle als null mit: Die Funktion
 * schreibt dann keinen Protokolleintrag (so sagt es auch die Datenschutzerklärung: protokolliert werden Korrekturen
 * durch den Vorstand und Bereinigungen, keine eigenen Änderungen).
 *
 * Rückgabe: ok = gespeichert (oder schon so), konflikt = inzwischen geändert (nichts geschrieben), fehler.
 */
export async function speichereStudiengang(
  admin: SupabaseClient,
  profileId: string,
  erwartet: string | null,
  neu: string,
  options: { correctedBy?: string } = {},
): Promise<"ok" | "konflikt" | "fehler"> {
  const vorstand = options.correctedBy ?? null;
  const { data, error } = await admin.rpc("save_member_studiengang", {
    p_profile_id: profileId,
    p_expected: erwartet,
    p_studiengang: neu,
    p_corrected_by: vorstand,
    p_quelle: vorstand ? "vorstand" : null,
  });
  if (error) {
    console.error("speichereStudiengang:", error.code);
    return "fehler";
  }
  return data === true ? "ok" : "konflikt";
}

/** Gespeicherter Wert aus einer Profilzeile (null, wenn leer oder kein Text). */
export function studiengangAusProfil(profil: Record<string, unknown> | null | undefined): string | null {
  const wert = profil?.["Studiengang / Fach"];
  return typeof wert === "string" ? wert : null;
}

/**
 * Stand beim Öffnen des Formulars (`vorher`, aus dem Browser) gegen den frisch gelesenen Wert: gleich, wenn beide
 * nach dem Trimmen übereinstimmen (wie bei den Namen). Sonst hat jemand anderes inzwischen geändert.
 */
export function studiengangStandPasst(vorher: unknown, aktuell: string | null): boolean {
  return (typeof vorher === "string" ? vorher : "").trim() === (aktuell ?? "").trim();
}
