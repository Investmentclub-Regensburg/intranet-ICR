/**
 * Studiengang als Auswahl (profiles."Studiengang / Fach"). Gespeichert wird weiter Text: der Name aus der Liste
 * oder bei „Sonstiges“ der Freitext. Keine Tabelle, keine Migration.
 *
 * Grundlage: Studienangebot der Universität Regensburg und der OTH Regensburg (Recherche mit Quellen in
 * _intern/investmentclub/intranet/studiengang/recherche.md, Stand 19.11.2026) und die Schreibweisen, die Mitglieder
 * bisher angegeben haben (studiengang-auswahl.md). Gleichnamige Studiengänge beider Hochschulen stehen einmal in der
 * Liste, die Hochschule fragt die Registrierung getrennt ab.
 *
 * Reihenfolge: zuerst die Studiengänge, die Mitglieder schon angegeben haben (nach Häufigkeit), dann alle übrigen
 * alphabetisch, ganz unten „Sonstiges“ und „Kein Studium“.
 *
 * Reine Funktionen ohne Server-Abhängigkeit: genutzt von der Registrierung (Client + Server-Action), vom
 * Bereinigungsskript scripts/studiengang.mjs und von den Tests.
 */
import { FIELD_LIMITS, checkText } from "./member-fields";

export type Studiengang = {
  /** Kurzer, gebräuchlicher Name; genau dieser Text wird gespeichert. */
  name: string;
  /**
   * Andere Schreibweisen (Langform, Abkürzung). Finden den Eintrag bei der Suche und gelten bei der Bereinigung
   * als „sicher“ (auch mit anderer Groß-/Kleinschreibung, Bindestrichen, Leerzeichen).
   */
  aliase?: readonly string[];
  /** Nur Suchbegriffe (z. B. Teile des offiziellen Namens), keine automatische Zuordnung. */
  suche?: readonly string[];
};

export const SONSTIGES = "Sonstiges";
export const KEIN_STUDIUM = "Kein Studium";

/** Studiengänge, die Mitglieder schon angegeben haben, nach Häufigkeit (Zählung 19.11.2026). */
const BISHER_ANGEGEBEN: readonly Studiengang[] = [
  {
    name: "BWL",
    aliase: ["Betriebswirtschaftslehre", "Betriebswirtschaft"],
    suche: ["Business Administration"],
  },
  {
    name: "Business Management",
    suche: ["Finance und Controlling", "Marketing und Digitalisierung"],
  },
  { name: "Immobilienwirtschaft", suche: ["Real Estate"] },
  { name: "Wirtschaftsinformatik", suche: ["Information Systems"] },
  // „Economics“ nur Suchbegriff (Review N7): klingt auch nach IVWL oder Business, Economics & Psychology.
  { name: "VWL", aliase: ["Volkswirtschaftslehre", "Volkswirtschaft"], suche: ["Economics"] },
  { name: "Digital Business" },
  {
    name: "Internationale VWL",
    aliase: ["IVWL", "Internationale Volkswirtschaftslehre"],
    suche: ["International Economics"],
  },
  { name: "Business, Economics & Psychology", suche: ["Wirtschaftspsychologie"] },
  { name: "Mathematik" },
  // UR B.Sc. Digital Business und OTH B.A. Digital Business Management sind zwei Studiengänge (Recherche).
  { name: "Digital Business Management" },
  { name: "Jura", aliase: ["Rechtswissenschaften", "Rechtswissenschaft"], suche: ["Staatsexamen", "Recht"] },
  { name: "International Relations and Management" },
  { name: "Architektur" },
  { name: "International Business Management" },
  { name: "KI und Data Science", aliase: ["Künstliche Intelligenz und Data Science"] },
  { name: "Wirtschaftschemie" },
];

/**
 * Übrige Studiengänge aus der Recherche (Universität Regensburg + OTH Regensburg, Bachelor, Master, Staatsexamen,
 * berufsbegleitend). Kurze Namen ohne Abschluss; Zusätze wie „(Bachelor)“, „(als Nebenfach)“ und englische
 * Zweitnamen stehen als Suchbegriff. Lehramt ist ein Eintrag. Dasselbe Fach mit anderem Namen für Bachelor/Master
 * oder auf Englisch ist ein Eintrag mit Alias (Review N8). Sortiert wird unten (STUDIENGAENGE).
 */
const WEITERE: readonly Studiengang[] = [
  { name: "Advanced Nursing Practice" },
  { name: "Allgemeine und Vergleichende Sprachwissenschaft" },
  { name: "Amerikanistik", suche: ["American Studies"] },
  { name: "Angewandte Bewegungswissenschaften", suche: ["Sport"] },
  { name: "Angewandte Naturwissenschaften" },
  { name: "Anglistik", aliase: ["Britische Literatur- und Kulturwissenschaft", "British Studies"], suche: ["Englisch"] },
  { name: "Applied Research in Engineering Sciences" },
  { name: "Bauingenieurwesen" },
  { name: "Bauklimatik" },
  { name: "Bildende Kunst und Ästhetische Erziehung", suche: ["Kunst"] },
  { name: "Biochemie", aliase: ["Biochemistry"] },
  { name: "Biologie" },
  { name: "Biomedical Engineering" },
  { name: "Business Administration (MBA)", suche: ["MBA", "General Management", "Leadership"] },
  { name: "Cancer and Immunity" },
  { name: "Car IT und Elektronik" },
  { name: "Chemie", aliase: ["Chemistry"] },
  { name: "Collectivity Studies" },
  { name: "Compliance" },
  { name: "Controlling (MBA)", suche: ["MBA"] },
  { name: "Data Science" },
  { name: "Demokratiewissenschaft" },
  { name: "Deutsch-Französische Studien", suche: ["Études Franco-Allemandes"] },
  { name: "Deutsch-Italienische Studien", suche: ["Studi Italo-Tedeschi"] },
  { name: "Deutsch-Tschechische Studien" },
  { name: "Deutsches Recht und Rechtsvergleichung", suche: ["German and Comparative Law", "LL.M."] },
  { name: "Digital Engineering im Maschinenbau" },
  { name: "Digital Entrepreneurship" },
  { name: "Digital Humanities" },
  { name: "Digital Law", suche: ["Recht"] },
  { name: "Ecology, Evolution and Conservation" },
  { name: "Electrical and Microsystems Engineering" },
  { name: "Elektro- und Informationstechnik", suche: ["Elektrotechnik"] },
  { name: "Elektromobilität und Energienetze" },
  {
    name: "Englische Sprachwissenschaft",
    aliase: ["Englische Linguistik", "English Linguistics"],
    suche: ["Englisch"],
  },
  { name: "Erziehungswissenschaft", suche: ["Educational Science", "Pädagogik"] },
  { name: "European Studies" },
  { name: "Europäisch-Amerikanische Studien", suche: ["European-American Studies"] },
  { name: "Europäische Betriebswirtschaft" },
  { name: "Evangelische Theologie" },
  { name: "Evidence Based Practice Pflege" },
  { name: "Executive MBA Real Estate", suche: ["MBA", "Immobilien"] },
  { name: "Französische Philologie", suche: ["Französisch"] },
  { name: "Germanistik", aliase: ["Deutsche Philologie"], suche: ["Deutsch"] },
  { name: "Geschichte", suche: ["Europäische Gesellschaften im Wandel"] },
  { name: "Griechische Philologie" },
  { name: "Hebammenkunde", aliase: ["Hebammenwissenschaft"] },
  { name: "Historische Bauforschung" },
  { name: "Historische Musikwissenschaft" },
  { name: "Human Resource Management", suche: ["HRM", "Personal"] },
  { name: "Human-Centred AI", suche: ["KI"] },
  { name: "Industrial Engineering" },
  { name: "Industriedesign", aliase: ["Design"] },
  { name: "Informatik", aliase: ["Computer Science"] },
  { name: "Informationstechnologie" },
  { name: "Informationswissenschaft" },
  { name: "Intelligent Systems Engineering" },
  { name: "Interdisziplinäre Mittelalter- und Frühneuzeitstudien" },
  { name: "Interkulturelle Europa-Studien" },
  { name: "International Computer Science" },
  { name: "International Electrical Engineering" },
  { name: "International Management" },
  { name: "International Mechanical Engineering" },
  { name: "Italienische Philologie", suche: ["Italienisch"] },
  { name: "Katholische Religion" },
  { name: "Katholische Theologie" },
  { name: "Klassikstudien", aliase: ["Alte Geschichte – Klassikstudien"] },
  { name: "Klassische Archäologie" },
  { name: "Kriminologie und Gewaltforschung" },
  { name: "Kunstgeschichte" },
  { name: "Lateinische Philologie", suche: ["Latein"] },
  { name: "Leadership for Change" },
  { name: "Legal Tech" },
  {
    name: "Lehramt",
    suche: ["Grundschule", "Mittelschule", "Realschule", "Gymnasium", "Sonderpädagogik", "Staatsexamen"],
  },
  { name: "Leitung und Kommunikationsmanagement" },
  { name: "Liberal Arts" },
  { name: "Literatur – Wissen – Medien" },
  { name: "Logistik" },
  { name: "Logopädie" },
  { name: "Maschinenbau" },
  { name: "Mathematics for Business and Industry" },
  { name: "Mechatronik" },
  { name: "Medieninformatik", aliase: ["Media Informatics"] },
  { name: "Medienwissenschaft", aliase: ["Allgemeine und Vergleichende Medienwissenschaft"] },
  { name: "Medizin", aliase: ["Humanmedizin", "Medizin Niederbayern"], suche: ["Staatsexamen"] },
  { name: "Medizinische Chemie" },
  { name: "Medizinische Informatik" },
  { name: "Medizintechnik" },
  { name: "Mehrsprachigkeit und Regionalität" },
  { name: "Mikrosystemtechnik" },
  { name: "Molekulare Medizin" },
  { name: "Musik- und bewegungsorientierte Soziale Arbeit" },
  { name: "Musikwissenschaft" },
  { name: "Nachhaltige Energie- und Wasserstoffsysteme" },
  { name: "Nanoscience" },
  { name: "Naturwissenschaftlich-Mathematische Bildung" },
  { name: "Osteuropastudien" },
  { name: "Ost-West-Studien", suche: ["Europa im Diskurs"] },
  { name: "Perimortale Wissenschaften", suche: ["Sterben, Tod und Trauer"] },
  { name: "Pflege" },
  { name: "Pflegemanagement" },
  { name: "Pharmazie", suche: ["Staatsexamen"] },
  { name: "Philosophie" },
  { name: "Physik" },
  { name: "Physiotherapie" },
  { name: "Politikwissenschaft", suche: ["Politik"] },
  {
    name: "Psychologie",
    suche: ["Psychological Science", "Klinische Psychologie", "Biologische Psychologie", "Psychotherapie"],
  },
  { name: "Produktions- und Automatisierungstechnik" },
  { name: "Public History und Kulturvermittlung" },
  { name: "Regenerative Energietechnik und Energieeffizienz" },
  { name: "Rhetorik und Sprechwissenschaft" },
  { name: "Romanische Kulturräume" },
  { name: "Scientific Computing" },
  { name: "Slavistik", aliase: ["Slavische Studien"] },
  { name: "Soziale Arbeit", suche: ["Inklusion und Exklusion", "Sozialpädagogik"] },
  { name: "Spanische Philologie", suche: ["Spanisch"] },
  { name: "Südosteuropastudien" },
  { name: "Technische Informatik" },
  { name: "Umwelt- und Industriesensorik" },
  { name: "Ungarn-Studien" },
  { name: "Vergleichende Kulturwissenschaft" },
  { name: "Vor- und Frühgeschichte" },
  { name: "Wissenschaftsgeschichte" },
  { name: "Zahnmedizin", suche: ["Staatsexamen"] },
  { name: "Öffentliches Recht", suche: ["Recht"] },
];

const ENDE: readonly Studiengang[] = [
  { name: SONSTIGES, aliase: ["Sonstige"], suche: ["Andere", "Anderer Studiengang"] },
  { name: KEIN_STUDIUM, aliase: ["Kein Student", "Keine Studentin", "Kein Studium"], suche: ["Ausbildung", "Beruf"] },
];

export const STUDIENGAENGE: readonly Studiengang[] = Object.freeze([
  ...BISHER_ANGEGEBEN,
  ...[...WEITERE].sort((a, b) => a.name.localeCompare(b.name, "de")),
  ...ENDE,
]);

export const STUDIENGANG_NAMEN: readonly string[] = Object.freeze(STUDIENGAENGE.map((s) => s.name));

/** Ist `wert` genau ein Name der Liste (so, wie er gespeichert wird)? */
export function istListenName(wert: unknown): wert is string {
  return typeof wert === "string" && STUDIENGANG_NAMEN.includes(wert);
}

// ---------------------------------------------------------------------------------------------------
// Vergleichsschlüssel
// ---------------------------------------------------------------------------------------------------

/** Leerzeichen zusammenfassen und trimmen (so wird ein Freitext gespeichert). */
export function bereinigeText(roh: unknown): string {
  return String(roh ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Schlüssel für den Vergleich: ohne Groß-/Kleinschreibung, Bindestriche, Schrägstriche, Satzzeichen und doppelte
 * Leerzeichen; „&“ und „und“ zählen wie „and“.
 */
export function schluessel(roh: unknown): string {
  return bereinigeText(roh)
    .toLocaleLowerCase("de")
    .replace(/&/g, " and ")
    .replace(/[-‐‑‒–—_/\\,.;:()[\]"'„“”‚‘’+]/g, " ")
    .replace(/\bund\b/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

/** Leerer Altwert („“ oder „-“)? */
export function istLeer(roh: unknown): boolean {
  const t = bereinigeText(roh);
  return t === "" || /^[-–—.]+$/.test(t);
}

// ---------------------------------------------------------------------------------------------------
// Bereinigung der Altwerte
// ---------------------------------------------------------------------------------------------------

export type Sicherheit = "sicher" | "vorschlag" | "offen";

export type Normalisierung = {
  /**
   * sicher/vorschlag: Name aus der Liste. offen: der bereinigte Rohwert (bleibt als Freitext stehen).
   * Leerer Rohwert: null.
   */
  wert: string | null;
  sicherheit: Sicherheit;
};

/**
 * Schreibweisen, die nur ein Vorschlag sind: Abkürzungen mit zwei, drei Buchstaben, Schwerpunkte und Doppelangaben
 * (Information ginge verloren), Studiengänge, die es an UR und OTH so nicht gibt, mehrdeutige englische Namen.
 * Für die Altwerte hat Hannes die meisten freigegeben – das gilt nur im Bereinigungsskript
 * (scripts/lib/studiengang.mjs, ALTWERT_FREIGABEN), nie bei neuen Eingaben.
 */
const VORSCHLAEGE: Readonly<Record<string, string>> = {
  bw: "BWL",
  bm: "Business Management",
  dbm: "Digital Business Management",
  "bwl finance": "BWL",
  "bwl medienwissenschaften": "BWL",
  "angewandte wirtschaftsinformatik": "Wirtschaftsinformatik",
  elektronik: "Elektro- und Informationstechnik",
  economics: "VWL",
};

/**
 * Schreibweisen, die nie einem Listennamen zugeordnet werden, auch wenn einer ähnlich aussieht (Sammelbegriffe).
 * Bleiben „offen“ (das Bereinigungsskript leert die freigegebenen, Entscheidung Hannes 3).
 */
const NIE_ZUORDNEN: ReadonlySet<string> = new Set(
  [
    "Geisteswissenschaften",
    "Naturwissenschaften",
    "Wirtschaftswissenschaften",
    "Sozialwissenschaften",
    "Ingenieurwissenschaften",
  ].map(schluessel)
);

/**
 * Abschlusszusätze am Anfang oder Ende („BWL (Bachelor)“, „M.Sc. Informatik“, „Controlling (MBA)“), im Schlüssel
 * (Satzzeichen schon entfernt). Längere zuerst.
 */
const ABSCHLUSS_ZUSAETZE: readonly string[] = [
  "bachelor of science",
  "bachelor of arts",
  "bachelor of engineering",
  "bachelor of education",
  "bachelor of laws",
  "master of science",
  "master of arts",
  "master of engineering",
  "master of education",
  "master of laws",
  "bachelor",
  "master",
  "b sc",
  "m sc",
  "bsc",
  "msc",
  "b a",
  "m a",
  "b eng",
  "m eng",
  "b ed",
  "m ed",
  "ll b",
  "ll m",
  "llb",
  "llm",
  "mba",
  "staatsexamen",
];

/** Schlüssel ohne Abschlusszusätze am Anfang und Ende. */
export function ohneAbschluss(k: string): string {
  let rest = k;
  for (let geaendert = true; geaendert; ) {
    geaendert = false;
    for (const z of ABSCHLUSS_ZUSAETZE) {
      if (rest === z) return "";
      if (rest.startsWith(`${z} `)) {
        rest = rest.slice(z.length + 1);
        geaendert = true;
      } else if (rest.endsWith(` ${z}`)) {
        rest = rest.slice(0, -(z.length + 1));
        geaendert = true;
      }
    }
  }
  return rest.trim();
}

/** Exakte Zuordnung Schlüssel → Name (Name und Aliase jedes Eintrags, auch ohne Abschlusszusatz). */
const ZUORDNUNG: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const s of STUDIENGAENGE) {
    for (const form of [s.name, ...(s.aliase ?? [])]) {
      const k = schluessel(form);
      const vorhanden = map.get(k);
      if (vorhanden && vorhanden !== s.name) {
        throw new Error(`Studiengangsliste: Schreibweise doppelt vergeben (${form})`);
      }
      map.set(k, s.name);
    }
  }
  // „Controlling (MBA)“ auch als „controlling“, sofern der Schlüssel frei ist.
  for (const [k, name] of [...map.entries()]) {
    const kurz = ohneAbschluss(k);
    if (kurz && !map.has(kurz)) map.set(kurz, name);
  }
  return map;
})();

/** Exakter Treffer (Name oder Alias, auch ohne Abschlusszusatz) – ohne Tippfehler und Vorschläge. */
export function exakterTreffer(text: unknown): string | null {
  const k = schluessel(text);
  if (!k) return null;
  return ZUORDNUNG.get(k) ?? ZUORDNUNG.get(ohneAbschluss(k)) ?? null;
}

/** Kandidaten für die Tippfehler-Suche: Schlüssel von Namen und Aliasen ab 8 Zeichen. */
const TIPPFEHLER_KANDIDATEN: readonly { k: string; name: string }[] = [...ZUORDNUNG.entries()]
  .filter(([k]) => k.length >= 8)
  .map(([k, name]) => ({ k, name }));

/** Abstand nach Damerau-Levenshtein (Vertauschung zweier Nachbarn zählt 1), mit Abbruch über `grenze`. */
export function tippAbstand(a: string, b: string, grenze = 3): number {
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const zeile = new Array<number>(b.length + 1).fill(0);
    zeile[0] = i;
    return zeile;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let zeilenMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < zeilenMin) zeilenMin = v;
    }
    if (zeilenMin > grenze) return grenze + 1;
  }
  return d[a.length][b.length];
}

/** Bewertung eines Schlüssels; null = nichts gefunden. */
function bewerteSchluessel(k: string, text: string): Normalisierung | null {
  if (NIE_ZUORDNEN.has(k)) return { wert: text, sicherheit: "offen" };
  const vorschlag = VORSCHLAEGE[k];
  if (vorschlag) return { wert: vorschlag, sicherheit: "vorschlag" };
  const exakt = ZUORDNUNG.get(k);
  if (exakt) return { wert: exakt, sicherheit: "sicher" };

  // Tippfehler: nur bei längeren Werten, nur gegen längere Listennamen.
  if (k.length >= 8) {
    const treffer = TIPPFEHLER_KANDIDATEN.map((c) => ({ ...c, abstand: tippAbstand(k, c.k, 2) })).filter(
      (c) => c.abstand <= 2
    );
    const namen = new Set(treffer.map((t) => t.name));
    const eins = treffer.filter((t) => t.abstand === 1);
    if (namen.size === 1 && eins.length > 0) return { wert: eins[0].name, sicherheit: "sicher" };
    if (namen.size >= 1 && k.length >= 10) {
      const bester = [...treffer].sort((a, b) => a.abstand - b.abstand)[0];
      return { wert: bester.name, sicherheit: "vorschlag" };
    }
  }
  return null;
}

/**
 * Wert einem Namen der Liste zuordnen.
 *   sicher     gleicher Name/Alias (Groß-/Kleinschreibung, Bindestriche, Leerzeichen, Abschlusszusätze wie
 *              „(Bachelor)“ egal) oder genau ein Listenname mit einem offensichtlichen Tippfehler (ein Zeichen, ab
 *              8 Zeichen, kein zweiter ähnlicher).
 *   vorschlag  Abkürzung, Schwerpunkt, Doppelangabe, mehrdeutiger Name oder ein Tippfehler mit zwei Zeichen bzw.
 *              mehreren Kandidaten.
 *   offen      keine Zuordnung (bleibt Freitext unter „Sonstiges“) oder leer.
 * Unklare Fälle („BWL/ Medienwissenschaften“, „Geisteswissenschaften“) sind nie „sicher“.
 */
export function normalisiereStudiengang(rohwert: unknown): Normalisierung {
  if (istLeer(rohwert)) return { wert: null, sicherheit: "offen" };
  const text = bereinigeText(rohwert);
  const k = schluessel(text);
  if (!k) return { wert: text, sicherheit: "offen" };
  const direkt = bewerteSchluessel(k, text);
  if (direkt) return direkt;
  // Zusätze wie „(Bachelor)“ oder „B.Sc.“ abschneiden und dann normal bewerten.
  const kurz = ohneAbschluss(k);
  if (kurz && kurz !== k) {
    const ohne = bewerteSchluessel(kurz, text);
    if (ohne) return ohne;
  }
  return { wert: text, sicherheit: "offen" };
}

// ---------------------------------------------------------------------------------------------------
// Suche in der Auswahl
// ---------------------------------------------------------------------------------------------------

/**
 * Einträge zur Eingabe `text`, in Listenreihenfolge: erst die, deren Name oder Schreibweise mit dem Text beginnt,
 * dann die, die ihn enthalten. „Sonstiges“ steht bei einer Suche immer am Ende (Ausweg, wenn nichts passt).
 * Ohne Text: die ganze Liste. `ohneKeinStudium` blendet „Kein Studium“ aus (Registrierung mit „Ja, ich studiere“).
 */
export function sucheStudiengaenge(text: string, { ohneKeinStudium = false } = {}): Studiengang[] {
  const liste = STUDIENGAENGE.filter((s) => !(ohneKeinStudium && s.name === KEIN_STUDIUM));
  const q = schluessel(text);
  if (!q) return [...liste];
  const anfang: Studiengang[] = [];
  const enthalten: Studiengang[] = [];
  for (const s of liste) {
    if (s.name === SONSTIGES) continue;
    const formen = [s.name, ...(s.aliase ?? []), ...(s.suche ?? [])].map(schluessel);
    if (formen.some((f) => f.startsWith(q) || f.split(" ").some((wort) => wort.startsWith(q)))) anfang.push(s);
    else if (formen.some((f) => f.includes(q))) enthalten.push(s);
  }
  const sonstiges = liste.find((s) => s.name === SONSTIGES);
  return [...anfang, ...enthalten, ...(sonstiges ? [sonstiges] : [])];
}

/** Eingabe genau einem Eintrag zuordnen (für das Verlassen des Felds): nur „sicher“, sonst null. */
export function eindeutigerTreffer(text: string, { ohneKeinStudium = false } = {}): string | null {
  if (istLeer(text)) return null;
  const n = normalisiereStudiengang(text);
  if (n.sicherheit !== "sicher" || !n.wert) return null;
  if (ohneKeinStudium && n.wert === KEIN_STUDIUM) return null;
  return n.wert;
}

// ---------------------------------------------------------------------------------------------------
// Prüfung beim Speichern (Server)
// ---------------------------------------------------------------------------------------------------

export type StudiengangPruefung =
  | { ok: true; wert: string }
  | { ok: false; fehler: string; feld: "auswahl" | "freitext" };

/**
 * Eingabe aus Auswahl + Freitext prüfen und den zu speichernden Text liefern.
 *   auswahl   Name aus der Liste (oder „Sonstiges“)
 *   freitext  nur bei „Sonstiges“: Text, der gespeichert wird (Längengrenze wie bisher, FIELD_LIMITS.studium)
 * Ein Freitext, der genau einem Listennamen oder Alias entspricht (z. B. „bwl“, „BWL (Bachelor)“), wird als dieser
 * Name gespeichert. Tippfehler und Vorschläge werden nie still umgedeutet (Review M2). „Sonstiges“ oder
 * „Kein Studium“ als Freitext ist keine Angabe. `feld` sagt, an welchem Feld der Fehler steht.
 */
export function pruefeStudiengang(
  auswahl: unknown,
  freitext: unknown,
  { ohneKeinStudium = false } = {}
): StudiengangPruefung {
  const a = typeof auswahl === "string" ? auswahl.trim() : "";
  if (!a) return { ok: false, fehler: "Bitte wähl deinen Studiengang aus.", feld: "auswahl" };
  if (!istListenName(a) || (ohneKeinStudium && a === KEIN_STUDIUM)) {
    return { ok: false, fehler: "Bitte wähl deinen Studiengang aus der Liste.", feld: "auswahl" };
  }
  if (a !== SONSTIGES) return { ok: true, wert: a };

  const text = bereinigeText(typeof freitext === "string" ? freitext : "");
  const keineAngabe = { ok: false as const, fehler: "Bitte gib deinen Studiengang ein.", feld: "freitext" as const };
  if (!text || istLeer(text)) return keineAngabe;
  const fehler = checkText(text, "Studiengang", FIELD_LIMITS.studium);
  if (fehler) return { ok: false, fehler, feld: "freitext" };
  const n = normalisiereStudiengang(text);
  if (n.sicherheit === "sicher" && (n.wert === SONSTIGES || n.wert === KEIN_STUDIUM)) return keineAngabe;
  return { ok: true, wert: exakterTreffer(text) ?? text };
}

/** Anzeige eines gespeicherten Werts in der Auswahl: Listenname → Auswahl, sonst „Sonstiges“ + Freitext. */
export function auswahlAusWert(wert: unknown): { auswahl: string; freitext: string } {
  const text = bereinigeText(wert);
  if (istLeer(text)) return { auswahl: "", freitext: "" };
  if (istListenName(text)) return { auswahl: text, freitext: "" };
  return { auswahl: SONSTIGES, freitext: text };
}
