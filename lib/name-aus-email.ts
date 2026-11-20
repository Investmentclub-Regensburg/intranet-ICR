/**
 * Namen aus der E-Mail-Adresse ableiten (Entscheidung Hannes 20.11.2026): Für aktive Profile ohne Vor- und
 * Nachnamen schlägt das Bereinigungsskript scripts/namen.mjs den Namen aus Adressen im Muster
 * vorname.nachname@… vor. Die Domain ist egal (Uni, OTH und private Adressen).
 *
 * Rein und ohne I/O (nur Server und Node-Skripte, weil pruefeName aus lib/member-rules kommt).
 *
 * Ergebnis `sicherheit`:
 *   sicher     Name steht eindeutig in der Adresse, nur Groß-/Kleinschreibung ergänzt („anna-lena.weber“ →
 *              „Anna-Lena“ „Weber“). Darf ohne Durchsicht geschrieben werden.
 *   vorschlag  Name ist erkennbar, aber geraten: Umschrift ae/oe/ue → ä/ö/ü, ae/oe/ue am Wortanfang (nicht
 *              umgeschrieben) oder Namenszusatz („von-der-heide“ → „von der Heide“). Der Vorstand prüft.
 *   offen      kein Name ableitbar (vorname/nachname null), Grund in `gruende`.
 *
 * Umschrift (Hannes: „mit oe ist wahrscheinlich ein ö gemeint“): ae/oe/ue nur, wenn davor ein Konsonant steht.
 * Nach einem Vokal oder q ist es kein Umlaut (Bauer, Neuer, Sauer, Quelle), am Wortanfang bleibt es (Oetker,
 * Uebel – unklar, deshalb „vorschlag“). Namen aus AUSNAHMEN bleiben, wie sie sind. „ss“ wird nie zu „ß“.
 */
import { pruefeName } from "./member-rules";

export type NamensSicherheit = "sicher" | "vorschlag" | "offen";

/** Warum ein Name nur ein Vorschlag ist. */
export type VorschlagGrund = "umschrift" | "anfang" | "partikel";

/** Warum kein Name ableitbar ist. */
export type OffenGrund = "adresse" | "teile" | "ziffern" | "zeichen" | "kurz" | "rolle" | "gleich" | "name";

export type NameAusEmail =
  | { vorname: string; nachname: string; sicherheit: "sicher"; gruende: readonly [] }
  | { vorname: string; nachname: string; sicherheit: "vorschlag"; gruende: readonly VorschlagGrund[] }
  | { vorname: null; nachname: null; sicherheit: "offen"; gruende: readonly [OffenGrund] };

export const VORSCHLAG_GRUENDE: readonly VorschlagGrund[] = ["umschrift", "anfang", "partikel"];
export const OFFEN_GRUENDE: readonly OffenGrund[] = ["adresse", "teile", "ziffern", "zeichen", "kurz", "rolle", "gleich", "name"];

/**
 * Namen (klein, ganzer Wortteil zwischen Bindestrichen), in denen ae/oe/ue nach einem Konsonanten KEIN Umlaut
 * ist. Ohne diese Liste würde aus Michael „Michäl“, aus Manuel „Manül“, aus Joel „Jöl“. Aufgenommen sind
 * gebräuchliche Vornamen (hebräisch/biblisch, spanisch, französisch, englisch) und Nachnamen, bei denen es kein
 * deutsches Gegenstück mit Umlaut gibt. Ein Test sichert, dass jeder Eintrag wirklich umgeschrieben würde.
 * „Joerg“, „Juergen“, „Soeren“ stehen bewusst NICHT hier: das sind Jörg, Jürgen, Sören.
 */
export const AUSNAHMEN: ReadonlySet<string> = new Set([
  // Vornamen auf -ael/-aela/-aele
  "michael", "michaela", "mikael", "mikaela", "raphael", "raphaela", "rafael", "rafaela", "raffael", "raffaela",
  "raffaele", "ismael", "ishmael", "israel", "gael", "natanael", "nathanael", "rachael",
  // Vornamen auf -uel/-uela/-uele
  "manuel", "manuela", "emanuel", "emanuela", "emanuele", "immanuel", "samuel", "samuela", "samuele", "lemuel",
  "miguel", "consuelo",
  // Vornamen mit oe (englisch/französisch/griechisch)
  "joel", "joelle", "noel", "noelle", "noemi", "zoe", "chloe", "phoebe", "joe",
  // kurze englische Vornamen
  "mae", "rae", "jae",
  // Nachnamen (spanisch, niederländisch, Goethe)
  "rodriguez", "rodrigues", "dominguez", "guerrero", "guerra", "guevara", "fuentes", "fuente", "cuevas", "bueno",
  "puerta", "puerto", "boer", "hoek", "hoekstra", "groen", "koen", "roel", "goethe",
]);

/**
 * Wortteile, die auf eine Rollen- oder Sammeladresse statt auf eine Person deuten („info.verein@…“). Steht einer
 * davon als Vor- oder Nachname (oder als Teil mit Bindestrich) in der Adresse, bleibt der Name offen.
 */
export const ROLLEN: ReadonlySet<string> = new Set([
  "info", "infos", "kontakt", "contact", "office", "buero", "mail", "email", "post", "postfach", "test", "admin",
  "administrator", "service", "support", "team", "verein", "vorstand", "noreply", "no-reply", "hallo", "hello",
  "webmaster", "postmaster", "kasse", "finanzen", "sekretariat", "verwaltung", "newsletter", "presse", "marketing",
  "sales", "anfrage", "anfragen", "bewerbung", "mitglied", "mitglieder", "member", "user", "demo", "beispiel",
  "example", "icr", "investmentclub", "club", "uni", "oth", "student", "studenten", "studium", "privat", "private",
]);

/** Namenszusätze, die im Nachnamen klein und mit Leerzeichen stehen („von-der-heide“ → „von der Heide“). */
export const PARTIKEL: ReadonlySet<string> = new Set([
  "von", "vom", "van", "zu", "zum", "zur", "der", "den", "de", "del", "della", "di", "da", "du", "la", "le", "ten",
  "ter", "op",
]);

const OFFEN = (grund: OffenGrund): NameAusEmail => ({ vorname: null, nachname: null, sicherheit: "offen", gruende: [grund] });

/** Ein Teil (Vor- oder Nachname): Buchstaben, mit Bindestrich getrennte Wortteile. */
const TEIL_ZEICHEN = /^[\p{L}-]+$/u;
const WORTTEIL = /^\p{L}+$/u;
/** Vor ae/oe/ue kein Umlaut: Vokal (inkl. y und Umlaute) oder q. */
const KEIN_UMLAUT_DAVOR = new Set(["a", "e", "i", "o", "u", "y", "ä", "ö", "ü", "q"]);
const UMLAUT: Readonly<Record<string, string>> = { a: "ä", o: "ö", u: "ü" };

type Wortteil = { text: string; umschrift: boolean; anfang: boolean };

const gross = (s: string): string => s.charAt(0).toLocaleUpperCase("de-DE") + s.slice(1);

/** Einen Wortteil (klein) umschreiben und großschreiben. */
function wandle(wort: string): Wortteil {
  if (AUSNAHMEN.has(wort)) return { text: gross(wort), umschrift: false, anfang: false };
  let text = "";
  let umschrift = false;
  let anfang = false;
  for (let i = 0; i < wort.length; i++) {
    const c = wort[i];
    if (c in UMLAUT && wort[i + 1] === "e") {
      if (i === 0) {
        anfang = true;
      } else if (!KEIN_UMLAUT_DAVOR.has(wort[i - 1])) {
        text += UMLAUT[c];
        umschrift = true;
        i++; // das „e“ entfällt
        continue;
      }
    }
    text += c;
  }
  return { text: gross(text), umschrift, anfang };
}

/**
 * Name aus einer E-Mail-Adresse ableiten. Nur der Teil vor dem „@“ zählt (ohne „+…“-Zusatz); er muss aus genau
 * zwei Teilen bestehen, getrennt durch „.“ oder „_“, jeder Teil nur Buchstaben und Bindestriche, jeder Wortteil
 * mindestens 2 Buchstaben.
 */
export function nameAusEmail(email: unknown): NameAusEmail {
  if (typeof email !== "string") return OFFEN("adresse");
  const adresse = email.normalize("NFC").trim();
  const stuecke = adresse.split("@");
  if (stuecke.length !== 2 || !stuecke[0] || !stuecke[1]) return OFFEN("adresse");

  // „max.mustermann+icr@…“: Zusatz nach „+“ gehört nicht zum Namen.
  const lokal = stuecke[0].split("+")[0].toLocaleLowerCase("de-DE");
  const teile = lokal.split(/[._]/);
  if (teile.length !== 2) return OFFEN("teile");
  if (teile.some((t) => /\p{N}/u.test(t))) return OFFEN("ziffern");
  if (teile.some((t) => !TEIL_ZEICHEN.test(t))) return OFFEN("zeichen");

  const worte = teile.map((t) => t.split("-"));
  // Leere Wortteile (Bindestrich am Rand, doppelt) sind kein Name.
  if (worte.some((w) => w.some((x) => !WORTTEIL.test(x)))) return OFFEN("zeichen");
  // Einzelbuchstaben (Initialen wie „a.mueller“ oder „anna-l.weber“) sind kein vollständiger Name.
  if (worte.some((w) => w.some((x) => x.length < 2))) return OFFEN("kurz");
  if (teile.some((t) => ROLLEN.has(t)) || worte.some((w) => w.some((x) => ROLLEN.has(x)))) return OFFEN("rolle");
  if (teile[0] === teile[1]) return OFFEN("gleich");

  const gruende = new Set<VorschlagGrund>();
  const baue = (woerter: string[]): string => {
    const gewandelt = woerter.map(wandle);
    for (const w of gewandelt) {
      if (w.umschrift) gruende.add("umschrift");
      if (w.anfang) gruende.add("anfang");
    }
    return gewandelt.map((w) => w.text).join("-");
  };

  const vorname = baue(worte[0]);

  // Nachname: führende Namenszusätze klein und mit Leerzeichen, wenn danach noch ein Name folgt.
  const nachWorte = worte[1];
  let p = 0;
  while (p < nachWorte.length - 1 && PARTIKEL.has(nachWorte[p])) p++;
  let nachname: string;
  if (p > 0) {
    gruende.add("partikel");
    nachname = `${nachWorte.slice(0, p).join(" ")} ${baue(nachWorte.slice(p))}`;
  } else {
    nachname = baue(nachWorte);
  }

  // Gegenprobe mit der Namensregel des Intranets (Länge, Zeichen) – genau diese Werte werden gespeichert.
  const v = pruefeName(vorname, "vorname");
  const n = pruefeName(nachname, "nachname");
  if (v.code || n.code || v.wert !== vorname || n.wert !== nachname) return OFFEN("name");

  if (gruende.size === 0) return { vorname, nachname, sicherheit: "sicher", gruende: [] };
  return { vorname, nachname, sicherheit: "vorschlag", gruende: VORSCHLAG_GRUENDE.filter((g) => gruende.has(g)) };
}
