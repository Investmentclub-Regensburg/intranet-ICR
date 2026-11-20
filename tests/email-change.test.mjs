// Tests für die Stand-Logik „E-Mail ändern“ (lib/email-change.ts): Stand 0/1 von 2, welches Postfach bestätigt ist,
// abgelaufene Links, Sendebremse, Startansicht des Fensters nach dem Link aus der Mail und das Ziel von /auth/confirm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KEINE_AENDERUNG,
  LINK_GUELTIG_SEKUNDEN,
  SENDE_ABSTAND_SEKUNDEN,
  emailChangeStand,
  emailConfirmZiel,
  emailHinweisAusParam,
  geradeBestaetigt,
  neuBestaetigt,
  startAnsicht,
} from "../lib/email-change.ts";
import { safeNextPath } from "../lib/safe-redirect.ts";

const row = (o = {}) => ({ offen: true, alt_bestaetigt: false, neu_bestaetigt: false, gesendet_vor_sekunden: 30, ...o });
const NEU = "neu@test.icr.local";

test("keine Zeile, nicht offen oder ohne neue Adresse = keine Änderung", () => {
  assert.deepEqual(emailChangeStand(null, NEU), KEINE_AENDERUNG);
  assert.deepEqual(emailChangeStand(undefined, NEU), KEINE_AENDERUNG);
  assert.deepEqual(emailChangeStand(row({ offen: false }), NEU), KEINE_AENDERUNG);
  assert.deepEqual(emailChangeStand(row({ offen: null }), NEU), KEINE_AENDERUNG);
  assert.deepEqual(emailChangeStand(row(), null), KEINE_AENDERUNG);
  assert.deepEqual(emailChangeStand(row(), "  "), KEINE_AENDERUNG);
});

test("0 von 2 direkt nach dem Senden", () => {
  const s = emailChangeStand(row(), NEU);
  assert.equal(s.offen, true);
  assert.equal(s.anzahl, 0);
  assert.equal(s.alt, false);
  assert.equal(s.neu, false);
});

test("1 von 2: welches Postfach bestätigt ist", () => {
  const alt = emailChangeStand(row({ alt_bestaetigt: true }), NEU);
  assert.deepEqual([alt.alt, alt.neu, alt.anzahl], [true, false, 1]);
  const neu = emailChangeStand(row({ neu_bestaetigt: true }), NEU);
  assert.deepEqual([neu.alt, neu.neu, neu.anzahl], [false, true, 1]);
});

test("beide Booleans zugleich (kann GoTrue nicht melden) zeigt nie 2 von 2 bei offener Änderung", () => {
  const s = emailChangeStand(row({ alt_bestaetigt: true, neu_bestaetigt: true }), NEU);
  assert.equal(s.anzahl, 1);
  assert.equal(s.alt, true);
  assert.equal(s.neu, false);
});

test("abgelaufene Links zählen nicht als offene Änderung", () => {
  assert.equal(emailChangeStand(row({ gesendet_vor_sekunden: LINK_GUELTIG_SEKUNDEN }), NEU).offen, true);
  assert.deepEqual(emailChangeStand(row({ gesendet_vor_sekunden: LINK_GUELTIG_SEKUNDEN + 1 }), NEU), KEINE_AENDERUNG);
  assert.deepEqual(
    emailChangeStand(row({ alt_bestaetigt: true, gesendet_vor_sekunden: 2 * LINK_GUELTIG_SEKUNDEN }), NEU),
    KEINE_AENDERUNG,
  );
});

test("Sendebremse: Wartezeit bis zum erneuten Senden", () => {
  assert.equal(emailChangeStand(row({ gesendet_vor_sekunden: 0 }), NEU).erneutInSekunden, SENDE_ABSTAND_SEKUNDEN);
  assert.equal(emailChangeStand(row({ gesendet_vor_sekunden: 5 }), NEU).erneutInSekunden, SENDE_ABSTAND_SEKUNDEN - 5);
  assert.equal(emailChangeStand(row({ gesendet_vor_sekunden: SENDE_ABSTAND_SEKUNDEN }), NEU).erneutInSekunden, 0);
  assert.equal(emailChangeStand(row({ gesendet_vor_sekunden: null }), NEU).erneutInSekunden, 0);
  assert.equal(emailChangeStand(row({ gesendet_vor_sekunden: -3 }), NEU).erneutInSekunden, SENDE_ABSTAND_SEKUNDEN);
});

test("Hinweis aus der Adresse: nur bekannte Werte, altes „ausstehend“ = bestätigt", () => {
  assert.equal(emailHinweisAusParam("bestaetigt"), "bestaetigt");
  assert.equal(emailHinweisAusParam("ausstehend"), "bestaetigt");
  assert.equal(emailHinweisAusParam("geaendert"), "geaendert");
  assert.equal(emailHinweisAusParam("fehler"), "fehler");
  assert.equal(emailHinweisAusParam("x"), null);
  assert.equal(emailHinweisAusParam(undefined), null);
  assert.equal(emailHinweisAusParam(["geaendert"]), null);
});

test("Startansicht nach dem Link in der Mail", () => {
  const offen0 = emailChangeStand(row(), NEU);
  const offenAlt = emailChangeStand(row({ alt_bestaetigt: true }), NEU);
  assert.equal(startAnsicht(null, offenAlt), null);
  assert.equal(startAnsicht("bestaetigt", offenAlt), "postfaecher");
  assert.equal(startAnsicht("bestaetigt", KEINE_AENDERUNG), null);
  assert.equal(startAnsicht("geaendert", KEINE_AENDERUNG), "erfolg");
  assert.equal(startAnsicht("geaendert", offen0), "postfaecher");
  assert.equal(startAnsicht("fehler", offen0), "postfaecher");
  assert.equal(startAnsicht("fehler", KEINE_AENDERUNG), "fehler");
});

test("Haken zeichnet sich nur im gerade bestätigten Postfach", () => {
  assert.equal(geradeBestaetigt("bestaetigt", emailChangeStand(row({ alt_bestaetigt: true }), NEU)), "alt");
  assert.equal(geradeBestaetigt("bestaetigt", emailChangeStand(row({ neu_bestaetigt: true }), NEU)), "neu");
  assert.equal(geradeBestaetigt("bestaetigt", emailChangeStand(row(), NEU)), null);
  assert.equal(geradeBestaetigt(null, emailChangeStand(row({ alt_bestaetigt: true }), NEU)), null);
  assert.equal(geradeBestaetigt("fehler", emailChangeStand(row({ alt_bestaetigt: true }), NEU)), null);
});

test("neu bestätigt zwischen zwei Abfragen", () => {
  const s0 = emailChangeStand(row(), NEU);
  const sAlt = emailChangeStand(row({ alt_bestaetigt: true }), NEU);
  const sNeu = emailChangeStand(row({ neu_bestaetigt: true }), NEU);
  assert.equal(neuBestaetigt(s0, sAlt), "alt");
  assert.equal(neuBestaetigt(s0, sNeu), "neu");
  assert.equal(neuBestaetigt(sAlt, sAlt), null);
  // Erneut gesendet: GoTrue setzt beide zurück, nichts zeichnet sich.
  assert.equal(neuBestaetigt(sAlt, s0), null);
  assert.equal(neuBestaetigt(sAlt, KEINE_AENDERUNG), null);
});

test("Ziel nach dem Bestätigungslink", () => {
  assert.equal(emailConfirmZiel({ ok: true, sitzung: true, angemeldet: true }), "/profile?email=geaendert");
  assert.equal(emailConfirmZiel({ ok: true, sitzung: false, angemeldet: true }), "/profile?email=bestaetigt");
  assert.equal(emailConfirmZiel({ ok: false, sitzung: false, angemeldet: true }), "/profile?email=fehler");
  assert.equal(
    emailConfirmZiel({ ok: false, sitzung: false, angemeldet: false }),
    "/login?error=Invalid_or_expired_token",
  );
  const login = emailConfirmZiel({ ok: true, sitzung: false, angemeldet: false });
  const url = new URL(login, "https://intranet.invalid");
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("email"), "ausstehend");
  // Das Ziel nach der Anmeldung besteht die Prüfung der Login-Seite (Open-Redirect-Schutz).
  assert.equal(safeNextPath(url.searchParams.get("next")), "/profile?email=bestaetigt");
});

test("Migration email_change_stand: nur eigenes Konto, nur authenticated, ohne Tokens", () => {
  const datei = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../supabase/migrations/20261121120000_email_change_stand.sql",
  );
  const sql = readFileSync(datei, "utf8").replace(/--.*$/gm, "");
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /where u\.id = auth\.uid\(\)/i);
  assert.match(sql, /revoke execute on function public\.email_change_stand\(\) from public, anon;/i);
  assert.match(sql, /grant execute on function public\.email_change_stand\(\) to authenticated;/i);
  assert.doesNotMatch(sql, /to anon/i);
  // Rückgabe nur Booleans und eine Zahl.
  const rueckgabe = /returns table \(([^)]*)\)/i.exec(sql)?.[1] ?? "";
  assert.doesNotMatch(rueckgabe, /\btext\b|token|email\b/i);
});
