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
// Die OTH hieß früher Hochschule (bzw. Fachhochschule) Regensburg; ohne „Regensburg“ zählen diese alten
// Namen nicht, weil „Hochschule“ allein jede Hochschule sein kann.
const OTH = /^((oth|ostbayerische technische hochschule)( regensburg)?|(hochschule|hs|fh|fachhochschule) regensburg)$/;

/** Hochschule vereinheitlichen. Leer → null (ohne Angabe), Unbekanntes → „Sonstige“. */
export function normalizeHochschule(raw: string | null | undefined): Hochschule | null {
  const v = schluessel(phpSerialisiertAuspacken(String(raw ?? "")))
    // Klammerzusatz weg: „Universität Regensburg (UR)“, „OTH Regensburg (Ostbayerische …)“.
    .replace(/\([^)]*\)?/g, " ")
    .replace(/[-–]/g, " ")
    .replace(/[.,;]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!v) return null;
  if (UNI.test(v) || v === "ur") return "Universität Regensburg";
  if (OTH.test(v)) return "OTH Regensburg";
  return "Sonstige";
}

/**
 * Abstand zweier kurzer Wörter (Levenshtein mit Vertauschung benachbarter Buchstaben als ein Schritt), für
 * Tippfehler wie „Bachlor“ oder „Matser“.
 */
function abstand(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
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

const BACHELOR_KURZ = new Set(["ba", "bsc", "beng", "bed", "llb", "bba"]);
const MASTER_KURZ = new Set(["ma", "msc", "meng", "med", "llm", "mba"]);

function abschlussWort(wort: string): "Bachelor" | "Master" | null {
  if (BACHELOR_KURZ.has(wort)) return "Bachelor";
  if (MASTER_KURZ.has(wort)) return "Master";
  if (!/^[a-zäöüß]+$/.test(wort)) return null;
  if (wort.startsWith("bachel") || (wort.length >= 6 && abstand(wort, "bachelor") <= 2)) return "Bachelor";
  // Höchstens ein Schritt: „Matser“, „Mster“, aber nicht „Meister“.
  if (wort.startsWith("master") || (wort.length >= 5 && abstand(wort, "master") <= 1)) return "Master";
  return null;
}

/**
 * Abschluss vereinheitlichen: Bachelor-/Master-Varianten, Kürzel (B.Sc., M.A., LL.B., LL.M. …) und Tippfehler
 * an beliebiger Stelle („BWL Bachelor“, „B.Sc. Wirtschaftsinformatik“), Staatsexamen, PHP-serialisierte
 * Altwerte; sonst „Sonstige“. Das erste erkannte Wort entscheidet.
 */
export function normalizeAbschluss(raw: string | null | undefined): Abschluss | null {
  const v = schluessel(phpSerialisiertAuspacken(String(raw ?? "")));
  if (!v) return null;
  if (/staats\s?ex/.test(v)) return "Staatsexamen";
  const ganz = abschlussWort(v.replace(/[\s.]/g, ""));
  if (ganz) return ganz;
  for (const teil of v.split(/[\s,;/()+&-]+/)) {
    const treffer = abschlussWort(teil.replace(/\./g, ""));
    if (treffer) return treffer;
  }
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
