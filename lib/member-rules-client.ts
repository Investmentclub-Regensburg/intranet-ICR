/**
 * Eingabehilfen für Mitgliederdaten im Browser (Formatierung beim Tippen, Platzhalter, Tippfehler-Hinweis).
 * Diese Datei ENTSCHEIDET NICHTS: Gültig ist nur, was lib/member-rules.ts auf dem Server sagt.
 *
 * Bundle-Grenze: Hier nur `libphonenumber-js/min` (kleine Metadaten, ohne Nummerntyp) und die
 * Mobil-Beispielnummern. NIE `libphonenumber-js/max` oder lib/member-rules.ts importieren (die Typprüfung
 * „Mobil“ braucht `max` und läuft nur auf dem Server), NIE lib/member-crypto* (node:crypto).
 * Ein Test in tests/member-rules.test.mjs prüft die Importe dieser Datei.
 */
import { AsYouType, getCountryCallingCode, getExampleNumber, isSupportedCountry, type CountryCode } from "libphonenumber-js/min";
import mobileExamples from "libphonenumber-js/mobile/examples";

const STANDARD_LAND = "DE";

function telefonLand(land: string | null | undefined): CountryCode {
  const l = String(land ?? "").trim().toUpperCase();
  return (isSupportedCountry(l) ? l : STANDARD_LAND) as CountryCode;
}

/** Nummer im internationalen Format ohne „+Vorwahl “ vorn (passt neben die Länderauswahl). */
function ohneVorwahl(international: string, land: CountryCode): string {
  const prefix = `+${getCountryCallingCode(land)}`;
  return international.startsWith(prefix) ? international.slice(prefix.length).trim() : international;
}

export type HandyEingabe = { land: string; nummer: string };

/**
 * Formatiert die Handy-Eingabe beim Tippen und überträgt Vorwahlen auf die Auswahl:
 *   „+43 664…“ / „0043 664…“ → Land AT, Nummer „664 …“
 *   „0176…“ bei DE          → führende 0 (nationale Vorwahl) fällt weg: „176 …“
 * In Ländern, in denen die 0 zur Nummer gehört (z. B. Italien), bleibt sie stehen.
 * Unvollständige oder unbekannte Eingaben kommen unverändert zurück.
 */
export function formatiereHandyEingabe(eingabe: string, land: string | null | undefined): HandyEingabe {
  const auswahl = telefonLand(land);
  const roh = eingabe.trim();
  if (!roh) return { land: auswahl, nummer: "" };
  if (/[^0-9+()\-/.\s]/.test(roh)) return { land: auswahl, nummer: eingabe };

  const bereinigt = roh.replace(/^00/, "+").replace(/\(0\)/, "");
  const international = bereinigt.startsWith("+");
  const tipp = new AsYouType(international ? undefined : auswahl);
  tipp.input(bereinigt);
  const national = tipp.getNumber()?.nationalNumber;
  if (!national) return { land: auswahl, nummer: eingabe };

  let ziel = auswahl;
  if (international) {
    const erkannt = tipp.getCountry();
    if (erkannt) ziel = erkannt;
    else if (tipp.getCallingCode() !== getCountryCallingCode(auswahl)) return { land: auswahl, nummer: eingabe };
  }
  const formatiert = new AsYouType().input(`+${getCountryCallingCode(ziel)}${national}`);
  return { land: ziel, nummer: ohneVorwahl(formatiert, ziel) };
}

/** Platzhalter fürs Handyfeld je Land (Beispiel-Mobilnummer ohne Vorwahl), z. B. DE „1512 3456789“. */
export function handyPlatzhalter(land: string | null | undefined): string {
  const l = telefonLand(land);
  const beispiel = getExampleNumber(l, mobileExamples);
  return beispiel ? ohneVorwahl(beispiel.formatInternational(), l) : "";
}

/**
 * IBAN in Viererblöcken anzeigen (`DE89 3704 …`). Nur Anzeige: entfernt dieselben Zeichen wie
 * `normalizeIban` (alles außer A–Z/0–9, Großbuchstaben); gespeichert wird serverseitig über `normalizeIban`.
 */
export function ibanInViererbloecken(eingabe: string): string {
  const kompakt = eingabe.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return kompakt.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Domains, bei denen ein Tippfehler-Hinweis kommt. */
export const BEKANNTE_MAILDOMAINS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "outlook.com",
  "outlook.de",
  "hotmail.com",
  "hotmail.de",
  "t-online.de",
  "icloud.com",
  "yahoo.com",
  "yahoo.de",
  "st.oth-regensburg.de",
  "stud.uni-regensburg.de",
];

/** Echte Domains, die einer bekannten zum Verwechseln ähneln – kein Hinweis. */
const ECHTE_NACHBARN = new Set([
  "mail.com",
  "gmx.at",
  "gmx.ch",
  "gmx.com",
  "live.de",
  "live.com",
  "mail.de",
  "email.de",
  "oth-regensburg.de",
  "uni-regensburg.de",
  "ur.de",
]);

/** Damerau-Levenshtein (eingeschränkt, mit Vertauschung benachbarter Zeichen). */
function abstand(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Tippfehler-Hinweis zur Mail-Domain, z. B. „gmial.com“ → „Meintest du gmail.com?“; sonst null.
 * Erlaubt 1 Abweichung, bei langen Domains (ab 15 Zeichen, Hochschulen) 2.
 */
export function emailTippfehler(email: string): string | null {
  // Abstandsberechnung ist O(n·m) und läuft bei jedem Tastendruck: überlange Eingaben nicht auswerten.
  if (typeof email !== "string" || email.length > 254) return null;
  const at = email.trim().lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.trim().slice(at + 1).toLowerCase();
  if (!domain || BEKANNTE_MAILDOMAINS.includes(domain) || ECHTE_NACHBARN.has(domain)) return null;
  let bester: { domain: string; d: number } | null = null;
  for (const kandidat of BEKANNTE_MAILDOMAINS) {
    const grenze = kandidat.length >= 15 ? 2 : 1;
    const d = abstand(domain, kandidat);
    if (d <= grenze && (!bester || d < bester.d)) bester = { domain: kandidat, d };
  }
  return bester ? `Meintest du ${bester.domain}?` : null;
}
