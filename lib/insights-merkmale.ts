/**
 * Merkmale für die Insights-Verteilungen (Vorstand): Hochschule, Abschluss und Altersgruppe aus Altwerten
 * vereinheitlichen, dazu Median und Monate zwischen zwei Tagen. Reine Funktionen ohne Datenbankzugriff.
 *
 * Datenschutz: altersgruppe() bekommt das entschlüsselte Geburtsdatum nur auf dem Server und gibt allein
 * die Gruppe zurück. Das Datum selbst verlässt den Aufrufer nie (kein Rückgabewert, kein Log).
 */

export const HOCHSCHULEN = ["Universität Regensburg", "OTH Regensburg", "Sonstige"] as const;
export type Hochschule = (typeof HOCHSCHULEN)[number];

export const ABSCHLUESSE = ["Bachelor", "Master", "Staatsexamen", "Sonstige"] as const;
export type Abschluss = (typeof ABSCHLUESSE)[number];

export const ALTERSGRUPPEN = ["unter 20", "20 bis 22", "23 bis 25", "26 bis 29", "30 und älter"] as const;
export type Altersgruppe = (typeof ALTERSGRUPPEN)[number];

/** Kleinbuchstaben, ohne Ränder, Mehrfach-Leerzeichen zusammengefasst. Leer oder „-“ → "". */
function schluessel(raw: string | null | undefined): string {
  const v = String(raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return v === "-" || v === "–" ? "" : v;
}

/**
 * Altwerte aus dem früheren WordPress-Formular stehen PHP-serialisiert in der Spalte, z. B.
 * `a:1:{i:0;s:23:"Universität Regensburg";}`. Dann zählt der erste Text darin.
 */
export function phpSerialisiertAuspacken(raw: string): string {
  if (!/^a:\d+:\{/.test(raw.trim())) return raw;
  const m = /s:\d+:"([^"]*)"/.exec(raw);
  return m ? m[1] : "";
}

const UNI = /^(uni|universit(ä|ae|a)t|university)( (of )?regensburg)?$/;
const OTH = /^(oth|ostbayerische technische hochschule)( regensburg)?$/;

/** Hochschule vereinheitlichen. Leer → null (ohne Angabe), Unbekanntes → „Sonstige“. */
export function normalizeHochschule(raw: string | null | undefined): Hochschule | null {
  const v = schluessel(phpSerialisiertAuspacken(String(raw ?? "")))
    .replace(/[-–]/g, " ")
    .replace(/[.,;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return null;
  if (UNI.test(v) || v === "ur") return "Universität Regensburg";
  if (OTH.test(v)) return "OTH Regensburg";
  return "Sonstige";
}

/** Levenshtein-Abstand (kurze Wörter, für Tippfehler wie „Bachlor“). */
function abstand(a: string, b: string): number {
  const zeile = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let vorher = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const merk = zeile[j];
      zeile[j] = Math.min(zeile[j] + 1, zeile[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
      vorher = merk;
    }
  }
  return zeile[b.length];
}

/** Abschluss vereinheitlichen: Bachelor-/Master-Varianten und Tippfehler, Staatsexamen, sonst „Sonstige“. */
export function normalizeAbschluss(raw: string | null | undefined): Abschluss | null {
  const v = schluessel(raw);
  if (!v) return null;
  if (/staats\s?ex/.test(v)) return "Staatsexamen";
  const kompakt = v.replace(/[\s.]/g, "");
  if (/^b(a|sc|eng|ed)$/.test(kompakt)) return "Bachelor";
  if (/^m(a|sc|eng|ed)$/.test(kompakt)) return "Master";
  const wort = v.split(/[^a-zäöüß]+/).find(Boolean) ?? "";
  if (wort.startsWith("bachel") || (wort.length >= 6 && abstand(wort, "bachelor") <= 2)) return "Bachelor";
  if (wort.startsWith("master") || (wort.length >= 5 && abstand(wort, "master") <= 1)) return "Master";
  return "Sonstige";
}

/** Geburtsdatum (YYYY-MM-DD, Altformat TT.MM.JJJJ) → Kalendertag YYYY-MM-DD oder null. */
function geburtstag(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  let iso: string | null = null;
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const b = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (a) iso = `${a[1]}-${a[2]}-${a[3]}`;
  else if (b) iso = `${b[3]}-${b[2].padStart(2, "0")}-${b[1].padStart(2, "0")}`;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Altersgruppe am Tag `heute` (YYYY-MM-DD). Nicht lesbar, ungültig, in der Zukunft oder über 120 Jahre → null
 * (ohne Angabe).
 */
export function altersgruppe(geburtsdatum: string | null | undefined, heute: string): Altersgruppe | null {
  const tag = geburtstag(geburtsdatum);
  if (!tag || tag >= heute) return null;
  const alter = Number(heute.slice(0, 4)) - Number(tag.slice(0, 4)) - (heute.slice(5) < tag.slice(5) ? 1 : 0);
  if (alter < 0 || alter > 120) return null;
  if (alter < 20) return "unter 20";
  if (alter <= 22) return "20 bis 22";
  if (alter <= 25) return "23 bis 25";
  if (alter <= 29) return "26 bis 29";
  return "30 und älter";
}

/** Volle Monate von `von` bis `bis` (YYYY-MM-DD); null, wenn `bis` vor `von` liegt. */
export function volleMonate(von: string, bis: string): number | null {
  if (bis < von) return null;
  const monate =
    (Number(bis.slice(0, 4)) - Number(von.slice(0, 4))) * 12 +
    (Number(bis.slice(5, 7)) - Number(von.slice(5, 7))) -
    (bis.slice(8, 10) < von.slice(8, 10) ? 1 : 0);
  return Math.max(0, monate);
}

/** Median, bei gerader Anzahl Mittel der beiden mittleren Werte; leer → null. */
export function median(werte: readonly number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(s.length / 2);
  return s.length % 2 ? s[mitte] : (s[mitte - 1] + s[mitte]) / 2;
}
