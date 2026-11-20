/**
 * Reine Logik der Seite „Daten prüfen“ (/daten-bestaetigen, Design-Runde 19.11.2026, Skizze DatenPruefen.dc.html):
 * Texte, Zähler, Knopf, was als geändert gilt und was gesendet wird, welche Markierungen gelten. Ohne React und
 * ohne Regeln: Ob ein Wert gültig ist, sagt nur der Server (lib/member-rules.ts über die Actions).
 */
import { gleicheHandyEingabe } from "@/lib/member-inputs";
import { ibanInViererbloecken } from "@/lib/member-rules-client";

/** Werte der Seite, Schlüssel wie im Formular (AENDERN_FELDER). */
export type DatenWerte = {
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  land: string;
  handyLand: string;
  handynummer: string;
  /** Studiengang als Auswahl (Listenname, „Sonstiges“ oder leer) … */
  studiengang: string;
  /** … und der Freitext bei „Sonstiges“. */
  studiengangSonstiges: string;
  iban: string;
};

/** Meldung je Feld (Feldnamen der Regeln: vorname … handynummer, iban, geburtsdatum). */
export type Markierungen = Partial<Record<string, string>>;

/**
 * Überschrift (Hannes, 19.11.): gültig „Hallo Max, stimmen deine Daten noch?“, bei Mängeln „Hallo Max, bitte
 * aktualisiere deine Daten.“ Ohne Vornamen ohne Anrede.
 */
export function datenTitel(vorname: string, gueltig: boolean): string {
  const name = vorname.trim();
  const frage = gueltig ? "stimmen deine Daten noch?" : "bitte aktualisiere deine Daten.";
  return name ? `Hallo ${name}, ${frage}` : frage.charAt(0).toUpperCase() + frage.slice(1);
}

/** „Danke, Max.“ bzw. ohne Vornamen „Danke.“ */
export function dankeTitel(vorname: string): string {
  const name = vorname.trim();
  return name ? `Danke, ${name}.` : "Danke.";
}

/** Gespeichert (etwas geändert) → „aktualisiert“, nur bestätigt → „bestätigt“. */
export function dankeText(gespeichert: boolean): string {
  return gespeichert ? "Deine Daten sind aktualisiert." : "Deine Daten sind bestätigt.";
}

/** Teile der Anschrift (eine gleiche Meldung an mehreren Teilen zählt und steht nur einmal). */
export const ANSCHRIFT_FELDER = ["strasse", "hausnummer", "plz", "ort"] as const;

/**
 * Felder, die die Formularprüfung (`pruefeProfil`) bei unverändertem gespeichertem Wert NICHT neu bewertet
 * (Handy, Geburtsdatum; Name ist nie ein Bestandsmangel). Nur deren Mängel aus der ersten Bewertung bleiben stehen,
 * wenn der Server nur Formularfehler meldet. Alle anderen Felder bewertet das Formular immer selbst
 * (Gegenprobe in tests/member-data-check.test.mjs). Seit der Klickrunde 20.11.2026 hat das Handy im Bestand nie
 * einen Mangel (bleibt als Absicherung in der Liste); eine unveränderte freiwillige Anschrift mit Altmangel bewertet
 * das Formular ebenfalls nicht neu, sie ist im Bestand aber auch kein Mangel (also nie markiert).
 */
export const NUR_IM_BESTAND_GEPRUEFT: readonly string[] = ["handynummer", "geburtsdatum", "studiengang"];

/**
 * Wo die Meldung eines Felds steht: bei gleicher Meldung an mehreren Anschriftteilen nur am ersten (z. B. „Für eine
 * IBAN außerhalb des EWR brauchen wir die Anschrift.“ an allen vier). Liefert je markiertem Feld das Feld, unter dem
 * die Meldung angezeigt wird (für aria-describedby); Felder ohne eigene Anzeige zeigen auf das erste.
 */
export function meldungsOrt(markierungen: Markierungen): Record<string, string> {
  const ort: Record<string, string> = {};
  const erstesMit = new Map<string, string>();
  for (const [feld, text] of Object.entries(markierungen)) {
    if (!text) continue;
    if (!(ANSCHRIFT_FELDER as readonly string[]).includes(feld)) ort[feld] = feld;
  }
  for (const feld of ANSCHRIFT_FELDER) {
    const text = markierungen[feld];
    if (!text) continue;
    if (!erstesMit.has(text)) erstesMit.set(text, feld);
    ort[feld] = erstesMit.get(text)!;
  }
  return ort;
}

/** Zahl der offenen Angaben: je markiertem Feld eine, gleiche Meldungen der Anschrift zusammen nur eine. */
export function offeneAngaben(markierungen: Markierungen): number {
  const ort = meldungsOrt(markierungen);
  return Object.entries(ort).filter(([feld, anzeige]) => feld === anzeige).length;
}

/** „optional“ an der Anschrift nur, solange kein Anschriftteil markiert ist (sonst ist sie gerade Pflicht). */
export function anschriftOptional(markierungen: Markierungen): boolean {
  return !ANSCHRIFT_FELDER.some((feld) => markierungen[feld]);
}

/** Zähler in der Fußleiste. */
export function zaehlerText(offen: number): string {
  if (offen <= 0) return "Alles vollständig";
  return offen === 1 ? "1 Angabe fehlt noch" : `${offen} Angaben fehlen noch`;
}

/** Ein Knopf: „Stimmt alles, bestätigen“ nur, solange nichts geändert und nichts markiert ist. */
export function knopfText(geaendert: boolean, offen: number): string {
  return geaendert || offen > 0 ? "Speichern" : "Stimmt alles, bestätigen";
}

function gleich(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/**
 * Geänderte Felder gegenüber dem Start, als Feldnamen der Regeln („handynummer“ steht für Land + Nummer). Handy
 * nach der Eingabe-Formatierung verglichen (bloß umformatiert = unverändert), IBAN in Viererblöcken. „studiengang“
 * steht für Auswahl + Freitext (der Freitext zählt nur bei „Sonstiges“).
 */
export function geaenderteFelder(start: DatenWerte, jetzt: DatenWerte): string[] {
  const felder: string[] = [];
  for (const feld of ["vorname", "nachname", "geburtsdatum", "strasse", "hausnummer", "plz", "ort", "land"] as const) {
    if (!gleich(start[feld], jetzt[feld])) felder.push(feld);
  }
  const handyStart = { land: start.handyLand, nummer: start.handynummer };
  const handyJetzt = { land: jetzt.handyLand, nummer: jetzt.handynummer };
  if (!gleicheHandyEingabe(handyStart, handyJetzt)) felder.push("handynummer");
  if (ibanInViererbloecken(start.iban) !== ibanInViererbloecken(jetzt.iban)) felder.push("iban");
  if (
    start.studiengang !== jetzt.studiengang ||
    (jetzt.studiengang === "Sonstiges" && !gleich(start.studiengangSonstiges, jetzt.studiengangSonstiges))
  ) {
    felder.push("studiengang");
  }
  return felder;
}

/**
 * Was die Seite an den Server schickt: nur geänderte Felder (Handy immer als Paar aus Land und Nummer). Den Rest
 * nimmt der Server aus dem frisch gelesenen Bestand (eingabeMitBestand). So geht z. B. eine unveränderte IBAN nicht
 * noch einmal über die Leitung.
 */
export function zuSendendeWerte(start: DatenWerte, jetzt: DatenWerte): [keyof DatenWerte, string][] {
  const geaendert = geaenderteFelder(start, jetzt);
  const werte: [keyof DatenWerte, string][] = [];
  for (const feld of geaendert) {
    if (feld === "handynummer") {
      werte.push(["handyLand", jetzt.handyLand], ["handynummer", jetzt.handynummer]);
    } else if (feld === "studiengang") {
      werte.push(["studiengang", jetzt.studiengang], ["studiengangSonstiges", jetzt.studiengangSonstiges]);
    } else {
      werte.push([feld as keyof DatenWerte, jetzt[feld as keyof DatenWerte]]);
    }
  }
  return werte;
}

/**
 * Markierungen nach einer Prüfung des Servers (beim Verlassen eines Felds oder beim Absenden). `vollstaendig` (der
 * Server hat den ganzen Bestand danach bewertet): genau seine Meldungen. Sonst kennt der Server nur die
 * Formularfehler; dann bleiben aus der ersten Bewertung (`anfang`) nur Mängel unveränderter Felder, die das Formular
 * nicht neu bewertet (NUR_IM_BESTAND_GEPRUEFT, z. B. eine alte Handynummer). Alles andere sagt der Server neu, auch
 * wenn eine frühere Markierung (z. B. Pflicht-Anschrift wegen einer IBAN außerhalb des EWR) nicht mehr gilt.
 */
export function markierungenNachPruefung({
  anfang,
  pruefung,
  vollstaendig,
  geaendert,
}: {
  anfang: Markierungen;
  pruefung: Markierungen;
  vollstaendig: boolean;
  geaendert: readonly string[];
}): Markierungen {
  if (vollstaendig) return { ...pruefung };
  const ergebnis: Markierungen = {};
  for (const [feld, meldung] of Object.entries(anfang)) {
    if (meldung && NUR_IM_BESTAND_GEPRUEFT.includes(feld) && !geaendert.includes(feld)) ergebnis[feld] = meldung;
  }
  for (const [feld, meldung] of Object.entries(pruefung)) {
    if (meldung) ergebnis[feld] = meldung;
  }
  return ergebnis;
}

/**
 * Grün umrandet nach einer Prüfung des Servers (nur, wenn die Seite mit Mängeln begann, wie in der Skizze): Felder,
 * die zu Beginn markiert oder jetzt geändert sind und keine Markierung mehr haben.
 */
export function gruenNachPruefung(anfang: Markierungen, geaendert: readonly string[], markierungen: Markierungen): string[] {
  const kandidaten = new Set([...Object.keys(anfang).filter((f) => anfang[f]), ...geaendert]);
  return [...kandidaten].filter((f) => !markierungen[f]);
}

/** Markierungen ohne das gerade bearbeitete Feld (bis zur nächsten Prüfung gilt es als offen, nicht als falsch). */
export function ohneFeld(markierungen: Markierungen, ...felder: string[]): Markierungen {
  if (!felder.some((f) => markierungen[f])) return markierungen;
  const neu = { ...markierungen };
  for (const f of felder) delete neu[f];
  return neu;
}
