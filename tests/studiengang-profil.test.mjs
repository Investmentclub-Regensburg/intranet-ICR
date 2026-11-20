// Tests für den Studiengang nach der Registrierung (20.11.2026): Ändern im Profil und im Vorstandsfenster, Pflicht in
// der Abfrage „Stimmen deine Daten noch?“, Mängelzählung in Vorstandsübersicht und Skript. Alle Daten sind erfunden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KEIN_STUDIUM,
  SONSTIGES,
  STUDIENGANG_FEHLT,
  auswahlAusWert,
  studiengangAenderung,
  studiengangAnzeige,
  studiengangFehlt,
} from "../lib/studiengaenge.ts";
import { istAbfrageFaellig } from "../lib/member-data-check.ts";
import {
  bauDatenCheckAnsicht,
  bestaetigungsAenderungen,
  bewerteBestand,
  eingabeMitBestand,
  formularAusBestand,
  profilStudiengang,
  pruefeDatenCheckAenderung,
} from "../lib/member-data-check-server.ts";
import { speichereStudiengang, studiengangStandPasst } from "../lib/member-studiengang-server.ts";
import { STUDIENGANG_NAME, adminMitgliederZeilen } from "../lib/member-overview.ts";
import { bewerteProfil, formatierePruefung, zaehleAlle } from "../scripts/lib/datenqualitaet.mjs";
import { geaenderteFelder, markierungenNachPruefung, zuSendendeWerte } from "../components/member/daten-pruefen.ts";
import { gleicherStudiengang, mitStudiengang } from "../components/admin/member-list.ts";

const HEUTE = "2026-11-18";
const JETZT = new Date("2026-11-20T12:00:00Z"); // letzter Stichtag 15.9.2026
const PROFIL = "00000000-0000-4000-a000-000000000031";
const VORSTAND = "00000000-0000-4000-a000-000000000032";
const lies = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const gut = (extra = {}) => ({
  vorname: "Erika",
  nachname: "Muster",
  iban: "DE89370400440532013000",
  bic: null,
  geburtsdatum: "2001-04-12",
  strasse: "Musterstraße",
  hausnummer: "12a",
  plz: "93047",
  ort: "Regensburg",
  land: "DE",
  handynummer: "+491761234567",
  studiengang: "BWL",
  ...extra,
});

const ansicht = (bestand, extra = {}) =>
  bauDatenCheckAnsicht({
    bestand,
    alumni: false,
    email: "erika@example.org",
    version: 3,
    landBekannt: true,
    spaeterMoeglich: true,
    heute: HEUTE,
    ...extra,
  });

// ---------------------------------------------------------------------------------------------------
// Altwerte anzeigen, nichts still verändern
// ---------------------------------------------------------------------------------------------------

test("Altwert-Anzeige: Listenname, exakte andere Schreibweise, Freitext als „Sonstiges“, leer", () => {
  assert.deepEqual(auswahlAusWert("VWL"), { auswahl: "VWL", freitext: "" });
  // Exakter Alias (wie ein Freitext bei der Registrierung): Name der Liste.
  assert.deepEqual(auswahlAusWert("Bwl"), { auswahl: "BWL", freitext: "" });
  assert.deepEqual(auswahlAusWert("Betriebswirtschaftslehre"), { auswahl: "BWL", freitext: "" });
  // Tippfehler nie still umgedeutet: bleibt Text unter „Sonstiges“.
  assert.deepEqual(auswahlAusWert("Wirtschaftsinformatk"), { auswahl: SONSTIGES, freitext: "Wirtschaftsinformatk" });
  assert.deepEqual(auswahlAusWert("Diplom-Finanzwirt (FH)"), { auswahl: SONSTIGES, freitext: "Diplom-Finanzwirt (FH)" });
  assert.deepEqual(auswahlAusWert("Sonstiges"), { auswahl: SONSTIGES, freitext: "" });
  for (const leer of [null, undefined, "", "   ", "-"]) assert.deepEqual(auswahlAusWert(leer), { auswahl: "", freitext: "" });
  // Lesesicht und Abfrage: dieselbe Zuordnung als Text.
  assert.equal(studiengangAnzeige("Bwl"), "BWL");
  assert.equal(studiengangAnzeige("Diplom-Finanzwirt (FH)"), "Diplom-Finanzwirt (FH)");
  assert.equal(studiengangAnzeige(null), "");
  assert.equal(studiengangAnzeige(KEIN_STUDIUM), KEIN_STUDIUM);
});

test("Ändern: unveränderte Auswahl schreibt nichts (auch kein Altwert wird umgeschrieben)", () => {
  for (const alt of ["BWL", "Bwl", "Diplom-Finanzwirt (FH)", "Sonstiges", null, "", "-"]) {
    const start = auswahlAusWert(alt);
    assert.deepEqual(studiengangAenderung(alt, start.auswahl, start.freitext), { art: "unveraendert" }, String(alt));
  }
  // Freitext nur außen mit Leerraum: unverändert.
  assert.deepEqual(studiengangAenderung("Diplom-Finanzwirt (FH)", SONSTIGES, "  Diplom-Finanzwirt (FH) "), { art: "unveraendert" });
  // Freitext bei einem Listennamen wird ignoriert (das Textfeld gibt es dann nicht).
  assert.deepEqual(studiengangAenderung("BWL", "BWL", "egal"), { art: "unveraendert" });
});

test("Ändern: neuer Listenwert, „Sonstiges“ mit Text, zurück auf Listenwert, „Kein Studium“", () => {
  assert.deepEqual(studiengangAenderung("BWL", "VWL", ""), { art: "neu", wert: "VWL" });
  assert.deepEqual(studiengangAenderung("VWL", SONSTIGES, "Wirtschaftsrecht"), { art: "neu", wert: "Wirtschaftsrecht" });
  assert.deepEqual(studiengangAenderung("Wirtschaftsrecht", "BWL", ""), { art: "neu", wert: "BWL" });
  assert.deepEqual(studiengangAenderung(null, KEIN_STUDIUM, ""), { art: "neu", wert: KEIN_STUDIUM });
  // Freitext, der genau einem Namen entspricht, wird als Name gespeichert (wie bei der Registrierung).
  assert.deepEqual(studiengangAenderung("VWL", SONSTIGES, "bwl"), { art: "neu", wert: "BWL" });
  // Altwert „Bwl“ bewusst auf BWL gesetzt: das ist eine Änderung (die Auswahl stand schon auf BWL → unverändert).
  assert.deepEqual(studiengangAenderung("Bwl", "BWL", ""), { art: "unveraendert" });
});

test("Ändern: Fehler am richtigen Feld, leeren geht nicht", () => {
  assert.deepEqual(studiengangAenderung("BWL", "", ""), { art: "fehler", fehler: STUDIENGANG_FEHLT, feld: "studiengang" });
  assert.equal(studiengangAenderung("BWL", "Erfundenes Fach", "").feld, "studiengang");
  const ohneText = studiengangAenderung("BWL", SONSTIGES, "");
  assert.equal(ohneText.art, "fehler");
  assert.equal(ohneText.feld, "studiengangSonstiges");
  assert.equal(studiengangAenderung("BWL", SONSTIGES, "=1+1").feld, "studiengangSonstiges");
  // Formular ohne Studiengangfelder (null) bei gesetztem Wert: Fehler statt still leeren.
  assert.equal(studiengangAenderung("BWL", null, null).art, "fehler");
});

test("Sperre: Stand beim Öffnen gegen den frisch gelesenen Wert", () => {
  assert.equal(studiengangStandPasst("BWL", "BWL"), true);
  assert.equal(studiengangStandPasst("", null), true);
  assert.equal(studiengangStandPasst(" BWL ", "BWL"), true);
  assert.equal(studiengangStandPasst("BWL", "VWL"), false);
  assert.equal(studiengangStandPasst(null, "VWL"), false);
});

// ---------------------------------------------------------------------------------------------------
// Speichern: selbst ohne Protokoll, Vorstand mit Protokoll
// ---------------------------------------------------------------------------------------------------

/** Nachbau von save_member_studiengang (Migration 20261119120000): Compare-and-set, Protokoll nur mit Vorstand. */
function fakeAdmin(zeile, { rpcFehler = false } = {}) {
  const protokoll = [];
  const aufrufe = [];
  return {
    protokoll,
    aufrufe,
    zeile,
    rpc: async (name, a) => {
      aufrufe.push({ name, a });
      if (rpcFehler) return { data: null, error: { code: "XX000" } };
      if ((a.p_quelle === null) !== (a.p_corrected_by === null)) throw new Error("Quelle und Vorstand nur gemeinsam");
      if (a.p_studiengang === a.p_expected) return { data: true, error: null };
      if (zeile.studiengang !== a.p_expected) return { data: false, error: null };
      zeile.studiengang = a.p_studiengang;
      if (a.p_corrected_by !== null) {
        protokoll.push({ profile_id: a.p_profile_id, corrected_by: a.p_corrected_by, fields: ["studiengang"], quelle: a.p_quelle });
      }
      return { data: true, error: null };
    },
  };
}

test("Speichern selbst: kein Protokolleintrag (Vorstand und Quelle null)", async () => {
  const admin = fakeAdmin({ studiengang: "BWL" });
  assert.equal(await speichereStudiengang(admin, PROFIL, "BWL", "VWL"), "ok");
  assert.equal(admin.zeile.studiengang, "VWL");
  assert.equal(admin.aufrufe[0].name, "save_member_studiengang");
  assert.equal(admin.aufrufe[0].a.p_corrected_by, null);
  assert.equal(admin.aufrufe[0].a.p_quelle, null);
  assert.deepEqual(admin.protokoll, []);
});

test("Speichern durch den Vorstand: Protokoll mit Feld studiengang, Quelle vorstand, ohne Werte", async () => {
  const admin = fakeAdmin({ studiengang: null });
  assert.equal(await speichereStudiengang(admin, PROFIL, null, "Jura", { correctedBy: VORSTAND }), "ok");
  assert.deepEqual(admin.protokoll, [{ profile_id: PROFIL, corrected_by: VORSTAND, fields: ["studiengang"], quelle: "vorstand" }]);
  assert.equal(JSON.stringify(admin.protokoll).includes("Jura"), false);
});

test("Speichern: inzwischen geändert = Konflikt (nichts geschrieben), Datenbankfehler = fehler", async () => {
  const admin = fakeAdmin({ studiengang: "Informatik" });
  assert.equal(await speichereStudiengang(admin, PROFIL, "BWL", "VWL"), "konflikt");
  assert.equal(admin.zeile.studiengang, "Informatik");
  assert.equal(await speichereStudiengang(fakeAdmin({ studiengang: "BWL" }, { rpcFehler: true }), PROFIL, "BWL", "VWL"), "fehler");
});

test("Aufrufer: Profil und Abfrage speichern ohne Vorstand, das Vorstandsfenster mit; die SQL-Funktion protokolliert nur mit Vorstand", () => {
  const profil = lies("app/(intranet)/profile/actions.ts");
  assert.match(profil, /speichereStudiengang\(admin, profileId, studiengangVorher, studiengang\.wert\);/);
  const abfrage = lies("app/(intranet)/profile/data-check-actions.ts");
  assert.match(abfrage, /speichereStudiengang\(admin, g\.id, g\.studiengang, studiengang\);/);
  const vorstand = lies("app/(intranet)/admin/members/actions.ts");
  assert.match(vorstand, /speichereStudiengang\(admin, profileId, loaded\.studiengang, studiengang\.wert, \{\s*correctedBy: actorId,\s*\}\)/);
  const sql = lies("supabase/migrations/20261119120000_member_studiengang.sql");
  assert.match(sql, /if p_corrected_by is not null then\s+insert into public\.member_data_corrections/);
  // Datenschutzerklärung (unverändert): protokolliert werden nur Korrekturen durch den Vorstand und Bereinigungen.
  assert.match(lies("app/datenschutz/page.tsx"), /Bei Korrekturen durch den Vorstand, auch wenn er Fehler in den Mitgliedsdaten gesammelt/);
});

// ---------------------------------------------------------------------------------------------------
// Pflicht in der Abfrage
// ---------------------------------------------------------------------------------------------------

test("Regel „Studiengang Pflicht“: leer = Mangel, kein Später, auch bei Alumni; gesetzt = gültig", () => {
  assert.equal(studiengangFehlt(null), true);
  assert.equal(studiengangFehlt(" - "), true);
  assert.equal(studiengangFehlt("BWL"), false);
  assert.equal(studiengangFehlt(undefined), false); // nicht gelesen: nicht bewertet

  for (const leer of [null, "", "  ", "-"]) {
    const b = bewerteBestand(gut({ studiengang: leer }), false, HEUTE);
    assert.equal(b.gueltig, false, String(leer));
    assert.deepEqual(b.fehler, { studiengang: STUDIENGANG_FEHLT });
    const a = ansicht(gut({ studiengang: leer }));
    assert.equal(a.spaeterErlaubt, false);
    assert.equal(a.formularFehler.studiengang, STUDIENGANG_FEHLT);
    assert.equal(a.zeilen.find((z) => z.key === "studiengang").fehler, STUDIENGANG_FEHLT);
  }
  // Alumni ohne Bankdaten, aber ohne Studiengang: Mangel.
  const alumni = gut({ iban: null, studiengang: null });
  assert.deepEqual(bewerteBestand(alumni, true, HEUTE).fehler, { studiengang: STUDIENGANG_FEHLT });
  // Gesetzt (auch Altwert ohne Zuordnung): kein Mangel, Wert sichtbar, „Stimmt alles“ schreibt ihn nicht um.
  const alt = gut({ studiengang: "Diplom-Finanzwirt (FH)" });
  const a = ansicht(alt);
  assert.equal(a.gueltig, true);
  assert.equal(a.spaeterErlaubt, true);
  assert.deepEqual(a.zeilen.find((z) => z.key === "studiengang").wert, ["Diplom-Finanzwirt (FH)"]);
  assert.deepEqual(a.formular.studiengang, SONSTIGES);
  assert.deepEqual(a.formular.studiengangSonstiges, "Diplom-Finanzwirt (FH)");
  assert.deepEqual(bestaetigungsAenderungen(alt, bewerteBestand(alt, false, HEUTE).werte, false), { secrets: {}, namen: {} });
});

test("Fälligkeit: fehlender Studiengang löst die Abfrage auch nach einer Bestätigung und während „Später“ aus", () => {
  const basis = { eingeschaltet: true, aktiv: true, bestaetigtAm: "2026-11-20T14:10:00Z", erinnernAb: null, jetzt: JETZT };
  assert.equal(istAbfrageFaellig(basis), false);
  assert.equal(istAbfrageFaellig({ ...basis, pflichtLuecke: true }), true);
  assert.equal(istAbfrageFaellig({ ...basis, erinnernAb: "2026-11-27T12:00:00Z", pflichtLuecke: true }), true);
  // Schalter aus oder nicht aktiv: nie.
  assert.equal(istAbfrageFaellig({ ...basis, eingeschaltet: false, pflichtLuecke: true }), false);
  assert.equal(istAbfrageFaellig({ ...basis, aktiv: false, pflichtLuecke: true }), false);
  // Wert aus der Profilzeile (getCachedAuth liest die Spalte mit).
  assert.equal(profilStudiengang({ "Studiengang / Fach": null }), null);
  assert.equal(profilStudiengang({ "Studiengang / Fach": "BWL" }), "BWL");
  assert.equal(profilStudiengang({ id: "x" }), undefined);
  assert.equal(studiengangFehlt(profilStudiengang({ "Studiengang / Fach": "" })), true);
  assert.equal(studiengangFehlt(profilStudiengang({ id: "x" })), false);
  assert.match(lies("utils/supabase/cached-auth.ts"), /letzter_news_aufruf, "Studiengang \/ Fach"/);
});

test("Abfrage „Ändern“: erst wählen, dann geht es weiter; Fehler am Feld; neuer Wert wird gespeichert", () => {
  const leer = gut({ studiengang: null });
  const nichts = pruefeDatenCheckAenderung(eingabeMitBestand(() => null, leer), leer, false, false, HEUTE);
  assert.equal(nichts.gueltig, false);
  assert.equal(nichts.vollstaendig, true);
  assert.deepEqual(nichts.fehler, { studiengang: STUDIENGANG_FEHLT });

  const waehle = (werte) => (feld) => (feld in werte ? werte[feld] : null);
  const ok = pruefeDatenCheckAenderung(eingabeMitBestand(waehle({ studiengang: "VWL", studiengangSonstiges: "" }), leer), leer, false, false, HEUTE);
  assert.equal(ok.gueltig, true, ok.ersterFehler ?? "");
  assert.equal(ok.studiengang, "VWL");
  assert.deepEqual(ok.secrets, {});

  const ohneText = pruefeDatenCheckAenderung(eingabeMitBestand(waehle({ studiengang: SONSTIGES, studiengangSonstiges: "" }), leer), leer, false, false, HEUTE);
  assert.equal(ohneText.gueltig, false);
  assert.equal(ohneText.vollstaendig, false);
  assert.ok(ohneText.fehler.studiengangSonstiges);

  // Gesetzter Studiengang, andere Felder geändert: Studiengang bleibt unangetastet.
  const gesetzt = gut({ studiengang: "Bwl" });
  const r = pruefeDatenCheckAenderung(eingabeMitBestand(waehle({ ort: "Neutraubling" }), gesetzt), gesetzt, false, false, HEUTE);
  assert.equal(r.gueltig, true, r.ersterFehler ?? "");
  assert.equal("studiengang" in r, false);
  assert.deepEqual(formularAusBestand(gesetzt).studiengang, "BWL");

  // Formularfehler woanders: der Studiengang-Mangel aus der ersten Bewertung bleibt markiert.
  const anfang = ansicht(leer).formularFehler;
  const falscheIban = pruefeDatenCheckAenderung(eingabeMitBestand(waehle({ iban: "DE89370400440532013001" }), leer), leer, false, false, HEUTE);
  assert.equal(falscheIban.vollstaendig, false);
  const neu = markierungenNachPruefung({ anfang, pruefung: falscheIban.fehler, vollstaendig: false, geaendert: ["iban"] });
  assert.equal(neu.studiengang, STUDIENGANG_FEHLT);
});

test("Seite: Studiengang zählt als geändert und geht als Paar (Auswahl + Freitext) an den Server", () => {
  const start = {
    vorname: "Erika", nachname: "Muster", geburtsdatum: "", strasse: "", hausnummer: "", plz: "", ort: "", land: "DE",
    handyLand: "DE", handynummer: "", iban: "", studiengang: "", studiengangSonstiges: "",
  };
  assert.deepEqual(geaenderteFelder(start, start), []);
  const jetzt = { ...start, studiengang: SONSTIGES, studiengangSonstiges: "Wirtschaftsrecht" };
  assert.deepEqual(geaenderteFelder(start, jetzt), ["studiengang"]);
  assert.deepEqual(zuSendendeWerte(start, jetzt), [
    ["studiengang", SONSTIGES],
    ["studiengangSonstiges", "Wirtschaftsrecht"],
  ]);
  // Freitext ohne „Sonstiges“ zählt nicht.
  assert.deepEqual(geaenderteFelder({ ...start, studiengang: "BWL" }, { ...start, studiengang: "BWL", studiengangSonstiges: "x" }), []);
});

// ---------------------------------------------------------------------------------------------------
// Vorstandsfenster (Client-Logik)
// ---------------------------------------------------------------------------------------------------

test("Vorstandsfenster: Studiengang geht nur mit, wenn angefasst und geändert; sonst Ausgangswerte", () => {
  const basis = { vorname: "Erika", nachname: "Muster", iban: "" };
  const start = { auswahl: SONSTIGES, freitext: "Diplom-Finanzwirt (FH)" };
  assert.equal(gleicherStudiengang(start, { auswahl: SONSTIGES, freitext: " Diplom-Finanzwirt (FH) " }), true);
  // Nicht angefasst: nichts.
  assert.equal(mitStudiengang(null, basis, { auswahl: "BWL", freitext: "" }, start, new Set()), null);
  // Angefasst, aber wieder wie am Anfang: nichts.
  assert.equal(mitStudiengang(null, basis, start, start, new Set(["studiengang"])), null);
  // Nur der Studiengang geändert: Ausgangswerte + Studiengang.
  assert.deepEqual(mitStudiengang(null, basis, { auswahl: "BWL", freitext: "alt" }, start, new Set(["studiengang"])), {
    ...basis,
    studiengang: "BWL",
    studiengangSonstiges: "",
  });
  // Mit anderen Änderungen: angehängt.
  const eingabe = { ...basis, vorname: "Erik" };
  assert.deepEqual(mitStudiengang(eingabe, basis, { auswahl: SONSTIGES, freitext: "Wirtschaftsrecht" }, start, new Set(["studiengang"])), {
    ...eingabe,
    studiengang: SONSTIGES,
    studiengangSonstiges: "Wirtschaftsrecht",
  });
});

// ---------------------------------------------------------------------------------------------------
// Vorstandsübersicht und Skript zählen mit
// ---------------------------------------------------------------------------------------------------

const gueltigeSecrets = () => ({
  iban: "DE89370400440532013000",
  bic: null,
  geburtsdatum: "2001-04-12",
  strasse: null,
  hausnummer: null,
  plz: null,
  ort: null,
  handynummer: null,
  land: null,
});

test("Vorstandsübersicht: „Studiengang“ in den Mängeln (auch Alumni), nur für den Vorstand, nie der Wert", () => {
  const profile = [
    { id: "a", Vorname: "A", Nachname: "A", "Studiengang / Fach": null, Rolle: "member", Status: "active" },
    { id: "b", Vorname: "B", Nachname: "B", "Studiengang / Fach": "  ", Rolle: "alumni", Status: "active" },
    { id: "c", Vorname: "C", Nachname: "C", "Studiengang / Fach": "Wirtschaftsrecht", Rolle: "member", Status: "active" },
    { id: "d", Vorname: "D", Nachname: "D", "Studiengang / Fach": null, Rolle: "member", Status: "cancelled" },
  ];
  const secrets = new Map(profile.map((p) => [p.id, gueltigeSecrets()]));
  const rows = Object.fromEntries(adminMitgliederZeilen(profile, secrets, { vorstand: true, jetzt: JETZT, heute: HEUTE }).map((r) => [r.id, r]));
  assert.deepEqual(rows.a.datenMaengel, [STUDIENGANG_NAME]);
  assert.deepEqual(rows.b.datenMaengel, [STUDIENGANG_NAME]);
  assert.deepEqual(rows.c.datenMaengel, []);
  assert.equal(Object.hasOwn(rows.d, "datenMaengel"), false);
  for (const row of adminMitgliederZeilen(profile, secrets, { vorstand: false, jetzt: JETZT, heute: HEUTE })) {
    assert.equal(Object.hasOwn(row, "datenMaengel"), false);
  }
});

test("Skript datenqualitaet: zählt den fehlenden Studiengang (Code fehlt), repariert ihn nie, gibt keinen Wert aus", () => {
  const werte = gueltigeSecrets();
  const leer = bewerteProfil({ profil: { Status: "active", Rolle: "member", "Studiengang / Fach": "" }, werte, hatZeile: true, heute: HEUTE });
  assert.deepEqual(leer.maengel, [{ feld: "studiengang", code: "fehlt" }]);
  assert.deepEqual(leer.aenderungen, {});
  const alumni = bewerteProfil({ profil: { Status: "active", Rolle: "alumni", "Studiengang / Fach": null }, werte, hatZeile: true, heute: HEUTE });
  assert.deepEqual(alumni.maengel, [{ feld: "studiengang", code: "fehlt" }]);
  const gesetzt = bewerteProfil({ profil: { Status: "active", Rolle: "member", "Studiengang / Fach": "Geheimfach-XYZ" }, werte, hatZeile: true, heute: HEUTE });
  assert.deepEqual(gesetzt.maengel, []);
  // Ohne die Spalte (ältere Aufrufer): keine Aussage.
  const ohne = bewerteProfil({ profil: { Status: "active", Rolle: "member" }, werte, hatZeile: true, heute: HEUTE });
  assert.deepEqual(ohne.maengel, []);
  const z = zaehleAlle([leer, alumni, gesetzt]);
  assert.equal(z.aktivMitMangel, 2);
  const text = formatierePruefung(z);
  assert.match(text, /studiengang\s+fehlt\s+2/);
  assert.equal(text.includes("Geheimfach"), false);
  assert.match(lies("scripts/datenqualitaet.mjs"), /select\('id, "Status", "Rolle", "Studiengang \/ Fach"'/);
});
