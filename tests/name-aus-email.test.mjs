// Tests für lib/name-aus-email.ts (Namen aus der E-Mail-Adresse). Alle Adressen sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUSNAHMEN, PARTIKEL, ROLLEN, nameAusEmail } from "../lib/name-aus-email.ts";

const sicher = (vorname, nachname) => ({ vorname, nachname, sicherheit: "sicher", gruende: [] });
const vorschlag = (vorname, nachname, ...gruende) => ({ vorname, nachname, sicherheit: "vorschlag", gruende });
const offen = (grund) => ({ vorname: null, nachname: null, sicherheit: "offen", gruende: [grund] });

test("vorname.nachname → sicher, Großschreibung je Wortteil", () => {
  assert.deepEqual(nameAusEmail("max.mustermann@example.org"), sicher("Max", "Mustermann"));
  assert.deepEqual(nameAusEmail("lukas.bauer@st.oth-regensburg.de"), sicher("Lukas", "Bauer"));
  assert.deepEqual(nameAusEmail("anna-lena.weber@stud.uni-regensburg.de"), sicher("Anna-Lena", "Weber"));
  assert.deepEqual(nameAusEmail("paul.meier-schmidt@web.de"), sicher("Paul", "Meier-Schmidt"));
  assert.deepEqual(nameAusEmail("Max.Mustermann@Example.org"), sicher("Max", "Mustermann"));
  assert.deepEqual(nameAusEmail("MAX.MUSTERMANN@EXAMPLE.ORG"), sicher("Max", "Mustermann"));
  assert.deepEqual(nameAusEmail("  max.mustermann@example.org  "), sicher("Max", "Mustermann"));
});

test("Unterstrich als Trenner, „+“-Zusatz wird ignoriert", () => {
  assert.deepEqual(nameAusEmail("max_mustermann@gmx.de"), sicher("Max", "Mustermann"));
  assert.deepEqual(nameAusEmail("max.mustermann+icr@gmail.com"), sicher("Max", "Mustermann"));
  assert.deepEqual(nameAusEmail("+icr@gmail.com"), offen("teile"));
});

test("Domain ist egal (Uni, OTH, privat)", () => {
  for (const domain of ["stud.uni-regensburg.de", "st.oth-regensburg.de", "gmx.de", "t-online.de", "icloud.com"]) {
    assert.deepEqual(nameAusEmail(`erik.lang@${domain}`), sicher("Erik", "Lang"));
  }
});

test("Umschrift ae/oe/ue nach Konsonant → vorschlag", () => {
  assert.deepEqual(nameAusEmail("anna-lena.mueller@gmx.de"), vorschlag("Anna-Lena", "Müller", "umschrift"));
  assert.deepEqual(nameAusEmail("michael.schroeder@web.de"), vorschlag("Michael", "Schröder", "umschrift"));
  assert.deepEqual(nameAusEmail("manuel.koeppel@st.oth-regensburg.de"), vorschlag("Manuel", "Köppel", "umschrift"));
  assert.deepEqual(nameAusEmail("joerg.neuer@example.org"), vorschlag("Jörg", "Neuer", "umschrift"));
  assert.deepEqual(nameAusEmail("juergen.kaeser@example.org"), vorschlag("Jürgen", "Käser", "umschrift"));
  assert.deepEqual(nameAusEmail("soeren.guenther@example.org"), vorschlag("Sören", "Günther", "umschrift"));
  assert.deepEqual(nameAusEmail("lea.boehm-kuehn@example.org"), vorschlag("Lea", "Böhm-Kühn", "umschrift"));
});

test("kein Umlaut nach Vokal oder q (Bauer, Neuer, Sauer, Quelle, Feuerstein)", () => {
  assert.deepEqual(nameAusEmail("tim.bauer@example.org"), sicher("Tim", "Bauer"));
  assert.deepEqual(nameAusEmail("tim.neuer@example.org"), sicher("Tim", "Neuer"));
  assert.deepEqual(nameAusEmail("tim.sauer@example.org"), sicher("Tim", "Sauer"));
  assert.deepEqual(nameAusEmail("tim.quelle@example.org"), sicher("Tim", "Quelle"));
  assert.deepEqual(nameAusEmail("tim.feuerstein@example.org"), sicher("Tim", "Feuerstein"));
  assert.deepEqual(nameAusEmail("tim.treue@example.org"), sicher("Tim", "Treue"));
  assert.deepEqual(nameAusEmail("tim.kayer@example.org"), sicher("Tim", "Kayer"));
});

test("ae/oe/ue am Wortanfang bleibt, ist aber nur ein Vorschlag", () => {
  assert.deepEqual(nameAusEmail("tom.oetker@example.org"), vorschlag("Tom", "Oetker", "anfang"));
  assert.deepEqual(nameAusEmail("tom.uebel@example.org"), vorschlag("Tom", "Uebel", "anfang"));
  assert.deepEqual(nameAusEmail("aenne.mueller@example.org"), vorschlag("Aenne", "Müller", "umschrift", "anfang"));
});

test("Ausnahmen: Vornamen und Nachnamen ohne Umlaut bleiben sicher", () => {
  assert.deepEqual(nameAusEmail("michael.weber@example.org"), sicher("Michael", "Weber"));
  assert.deepEqual(nameAusEmail("manuel.weber@example.org"), sicher("Manuel", "Weber"));
  assert.deepEqual(nameAusEmail("raphael.huber@example.org"), sicher("Raphael", "Huber"));
  assert.deepEqual(nameAusEmail("samuel.lang@example.org"), sicher("Samuel", "Lang"));
  assert.deepEqual(nameAusEmail("joel.lang@example.org"), sicher("Joel", "Lang"));
  assert.deepEqual(nameAusEmail("zoe.lang@example.org"), sicher("Zoe", "Lang"));
  assert.deepEqual(nameAusEmail("chloe.lang@example.org"), sicher("Chloe", "Lang"));
  assert.deepEqual(nameAusEmail("phoebe.lang@example.org"), sicher("Phoebe", "Lang"));
  assert.deepEqual(nameAusEmail("noemi.lang@example.org"), sicher("Noemi", "Lang"));
  assert.deepEqual(nameAusEmail("miguel.rodriguez@example.org"), sicher("Miguel", "Rodriguez"));
  assert.deepEqual(nameAusEmail("israel.fuentes@example.org"), sicher("Israel", "Fuentes"));
  assert.deepEqual(nameAusEmail("michaela-zoe.lang@example.org"), sicher("Michaela-Zoe", "Lang"));
  // Ausnahme gilt je ganzem Wortteil, nicht für Teilstücke.
  assert.deepEqual(nameAusEmail("michael.manuelson@example.org"), vorschlag("Michael", "Manülson", "umschrift"));
});

test("jede Ausnahme würde ohne Liste umgeschrieben (Liste bleibt sinnvoll)", () => {
  for (const name of AUSNAHMEN) {
    assert.match(name, /^[a-z]+$/, name);
    assert.match(name, /[^aeiouyq](ae|oe|ue)/, `${name} enthält kein ae/oe/ue nach Konsonant`);
    const r = nameAusEmail(`${name}.lang@example.org`);
    assert.equal(r.sicherheit, "sicher", name);
    assert.equal(r.vorname, name.charAt(0).toUpperCase() + name.slice(1));
  }
  for (const umlaut of ["joerg", "juergen", "soeren"]) assert.ok(!AUSNAHMEN.has(umlaut), umlaut);
});

test("„ss“ wird nie zu „ß“", () => {
  assert.deepEqual(nameAusEmail("hannah.strauss@example.org"), sicher("Hannah", "Strauss"));
  assert.deepEqual(nameAusEmail("jonas.suess@example.org"), vorschlag("Jonas", "Süss", "umschrift"));
  assert.deepEqual(nameAusEmail("jonas.gross@example.org"), sicher("Jonas", "Gross"));
});

test("Namenszusatz im Nachnamen → klein, mit Leerzeichen, vorschlag", () => {
  assert.deepEqual(nameAusEmail("maria.von-der-heide@example.org"), vorschlag("Maria", "von der Heide", "partikel"));
  assert.deepEqual(nameAusEmail("lars.van-dyke@example.org"), vorschlag("Lars", "van Dyke", "partikel"));
  assert.deepEqual(nameAusEmail("lara.de-luca@example.org"), vorschlag("Lara", "de Luca", "partikel"));
  assert.deepEqual(nameAusEmail("jan.von-boehlen@example.org"), vorschlag("Jan", "von Böhlen", "umschrift", "partikel"));
  // Zusatz allein oder hinten: normaler Name.
  assert.deepEqual(nameAusEmail("jan.van@example.org"), sicher("Jan", "Van"));
  assert.deepEqual(nameAusEmail("jan.meier-von@example.org"), sicher("Jan", "Meier-Von"));
  // Im Vornamen nicht.
  assert.deepEqual(nameAusEmail("de-wayne.lang@example.org"), sicher("De-Wayne", "Lang"));
  assert.ok(PARTIKEL.has("von") && PARTIKEL.has("van"));
});

test("offen: mehr oder weniger als zwei Teile", () => {
  assert.deepEqual(nameAusEmail("maria.von.der.heide@example.org"), offen("teile"));
  assert.deepEqual(nameAusEmail("mustermann@example.org"), offen("teile"));
  assert.deepEqual(nameAusEmail("max.mustermann.jr@example.org"), offen("teile"));
  assert.deepEqual(nameAusEmail("max_mustermann.x@example.org"), offen("teile"));
  assert.deepEqual(nameAusEmail("max..mustermann@example.org"), offen("teile"));
  assert.deepEqual(nameAusEmail(".mustermann@example.org"), offen("zeichen"));
});

test("offen: Ziffern, Zeichen, Einzelbuchstaben", () => {
  assert.deepEqual(nameAusEmail("max.mustermann2@example.org"), offen("ziffern"));
  assert.deepEqual(nameAusEmail("max2.mustermann@example.org"), offen("ziffern"));
  assert.deepEqual(nameAusEmail("abc12345@stud.uni-regensburg.de"), offen("teile"));
  assert.deepEqual(nameAusEmail("max.muster'mann@example.org"), offen("zeichen"));
  assert.deepEqual(nameAusEmail("max.-mustermann@example.org"), offen("zeichen"));
  assert.deepEqual(nameAusEmail("max.muster--mann@example.org"), offen("zeichen"));
  assert.deepEqual(nameAusEmail("a.b@example.org"), offen("kurz"));
  assert.deepEqual(nameAusEmail("m.mustermann@example.org"), offen("kurz"));
  assert.deepEqual(nameAusEmail("anna-l.weber@example.org"), offen("kurz"));
});

test("offen: Rollenadressen", () => {
  assert.deepEqual(nameAusEmail("info.verein@example.org"), offen("rolle"));
  assert.deepEqual(nameAusEmail("kontakt.icr@example.org"), offen("rolle"));
  assert.deepEqual(nameAusEmail("max.test@example.org"), offen("rolle"));
  assert.deepEqual(nameAusEmail("office.mustermann@example.org"), offen("rolle"));
  assert.deepEqual(nameAusEmail("team-info.mustermann@example.org"), offen("rolle"));
  assert.deepEqual(nameAusEmail("no-reply.verein@example.org"), offen("rolle"));
  for (const r of ROLLEN) assert.equal(r, r.toLowerCase());
});

test("offen: keine Adresse, gleicher Vor- und Nachname", () => {
  for (const x of [null, undefined, 42, "", "max.mustermann", "@example.org", "max.mustermann@", "a@b@c"]) {
    assert.deepEqual(nameAusEmail(x), offen("adresse"), String(x));
  }
  assert.deepEqual(nameAusEmail("max.max@example.org"), offen("gleich"));
});

test("offen: Namensregel des Intranets (zu lang)", () => {
  const lang = "a".repeat(101);
  assert.deepEqual(nameAusEmail(`max.${lang}@example.org`), offen("name"));
});

test("Buchstaben mit Akzent bleiben erhalten", () => {
  assert.deepEqual(nameAusEmail("jörg.müller@example.org"), sicher("Jörg", "Müller"));
  assert.deepEqual(nameAusEmail("zoé.lefèvre@example.org"), sicher("Zoé", "Lefèvre"));
});

test("Ergebnis ist nie halb: sicher/vorschlag immer mit beiden Namen, offen ohne", () => {
  const adressen = [
    "max.mustermann@x.de", "a.b@x.de", "info.verein@x.de", "joerg.neuer@x.de", "maria.von-der-heide@x.de", "x@y",
  ];
  for (const a of adressen) {
    const r = nameAusEmail(a);
    if (r.sicherheit === "offen") {
      assert.equal(r.vorname, null);
      assert.equal(r.nachname, null);
      assert.equal(r.gruende.length, 1);
    } else {
      assert.ok(r.vorname && r.nachname, a);
      assert.equal(r.vorname, r.vorname.trim());
      assert.equal(r.sicherheit === "sicher", r.gruende.length === 0, a);
    }
  }
});
