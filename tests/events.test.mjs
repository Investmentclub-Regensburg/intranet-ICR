// Tests für die Datums-Helfer in lib/events.ts (mehrtägige Events) – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canChangeRegistration,
  capacityLabel,
  eventDays,
  eventEndTimestamp,
  formatEventDateRange,
  formatEventWhen,
  formatTimeRange,
  isEventPast,
  isEventFull,
  isMultiDay,
  isRegistrationOpen,
  parseMaxParticipants,
  registrationPhase,
} from "../lib/events.ts";

const berlin = (iso) => new Date(iso).getTime();

test("eintägige Events verhalten sich wie bisher", () => {
  const ev = { event_date: "2026-10-23", end_date: null, event_time: "19:00:00", end_time: "02:00:00" };
  assert.equal(isMultiDay(ev), false);
  assert.equal(formatTimeRange(ev.event_time, ev.end_time), "19:00 – 02:00 Uhr (Folgetag)");
  // Endet am Folgetag um 02:00 Berliner Zeit (Sommerzeit-Ende 25.10. noch nicht erreicht: UTC+2).
  assert.equal(eventEndTimestamp(ev), berlin("2026-10-24T00:00:00Z"));
  // Ohne end_date-Feld (alte Payloads) ebenso.
  const { end_date: _, ...old } = ev;
  assert.equal(eventEndTimestamp(old), eventEndTimestamp(ev));
});

test("mehrtägig: Ende am letzten Tag, kein Folgetag", () => {
  const ev = { event_date: "2026-10-23", end_date: "2026-10-25", event_time: "09:00", end_time: "08:00" };
  assert.equal(isMultiDay(ev), true);
  assert.equal(formatTimeRange(ev.event_time, ev.end_time, true), "Beginn 09:00 Uhr · Ende 08:00 Uhr");
  // 25.10.2026 ist Winterzeit (UTC+1).
  assert.equal(eventEndTimestamp(ev), berlin("2026-10-25T07:00:00Z"));
  assert.equal(isEventPast(ev, berlin("2026-10-24T12:00:00Z")), false);
  assert.equal(isEventPast(ev, berlin("2026-10-25T07:01:00Z")), true);
});

test("mehrtägig ohne Endzeit läuft bis Ende des letzten Tages", () => {
  const ev = { event_date: "2026-10-23", end_date: "2026-10-25", event_time: null, end_time: null };
  assert.equal(eventEndTimestamp(ev), berlin("2026-10-25T22:59:00Z"));
  assert.equal(formatTimeRange(ev.event_time, ev.end_time, true), "");
});

test("end_date gleich oder vor event_date gilt als eintägig", () => {
  assert.equal(isMultiDay({ event_date: "2026-10-23", end_date: "2026-10-23" }), false);
  assert.equal(isMultiDay({ event_date: "2026-10-23", end_date: "2026-10-22" }), false);
  assert.deepEqual(eventDays({ event_date: "2026-10-23", end_date: "2026-10-22" }), ["2026-10-23"]);
});

test("Zeitraum formatieren", () => {
  assert.equal(formatEventDateRange({ event_date: "2026-10-23", end_date: null }), "Fr., 23. Oktober 2026");
  assert.equal(
    formatEventDateRange({ event_date: "2026-10-23", end_date: "2026-10-25" }),
    "Fr., 23. Oktober – So., 25. Oktober 2026"
  );
  assert.equal(
    formatEventDateRange({ event_date: "2026-12-30", end_date: "2027-01-02" }),
    "Mi., 30. Dezember 2026 – Sa., 2. Januar 2027"
  );
  assert.equal(
    formatEventWhen({ event_date: "2026-10-23", end_date: "2026-10-25", event_time: "09:00", end_time: null }),
    "Fr., 23. Oktober – So., 25. Oktober 2026 · Beginn 09:00 Uhr"
  );
});

test("eventDays listet alle Tage, auch über Monatsgrenzen", () => {
  assert.deepEqual(eventDays({ event_date: "2026-10-30", end_date: "2026-11-02" }), [
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
  ]);
  assert.deepEqual(eventDays({ event_date: "2026-10-30", end_date: null }), ["2026-10-30"]);
  // Begrenzt auf 32 Tage (DB erlaubt max. 31 Tage nach Beginn).
  assert.equal(eventDays({ event_date: "2026-01-01", end_date: "2026-12-31" }).length, 32);
});

test("Anmeldung nur bis einschließlich Starttag (wie RLS-Policy)", () => {
  const trip = { event_date: "2026-10-23", end_date: "2026-10-25", event_time: "09:00", end_time: "18:00" };
  assert.equal(isRegistrationOpen(trip, berlin("2026-10-23T20:00:00Z")), true); // 23.10., 22:00 Berlin
  assert.equal(isRegistrationOpen(trip, berlin("2026-10-23T22:30:00Z")), false); // 24.10., 00:30 Berlin, läuft noch
  const evening = { event_date: "2026-10-23", end_date: null, event_time: "19:00", end_time: "21:00" };
  assert.equal(isRegistrationOpen(evening, berlin("2026-10-23T18:00:00Z")), true);
  assert.equal(isRegistrationOpen(evening, berlin("2026-10-23T19:30:00Z")), false); // vorbei
});

test("Anmeldephase: offen, ausgebucht, manuell geschlossen, Anmeldeschluss", () => {
  const before = berlin("2026-10-20T10:00:00Z");
  const ev = { event_date: "2026-10-23", end_date: null, event_time: "19:00", end_time: "21:00" };
  const open = { ...ev, max_participants: null, registration_closed: false };
  assert.equal(registrationPhase(open, 500, before), "open"); // unbegrenzt
  assert.equal(registrationPhase({ ...open, max_participants: 30 }, 29, before), "open");
  assert.equal(registrationPhase({ ...open, max_participants: 30 }, 30, before), "full");
  // Mehr Anmeldungen als Plätze (Altbestand vor Begrenzung) gilt ebenfalls als ausgebucht.
  assert.equal(registrationPhase({ ...open, max_participants: 30 }, 31, before), "full");
  // Geschlossen geht vor ausgebucht, Anmeldeschluss vor allem.
  assert.equal(registrationPhase({ ...open, max_participants: 30, registration_closed: true }, 30, before), "closed");
  assert.equal(registrationPhase({ ...open, registration_closed: true }, 0, berlin("2026-10-24T10:00:00Z")), "ended");
});

test("Knopf zum An-/Abmelden je Phase und eigenem Stand", () => {
  assert.equal(canChangeRegistration("open", "none"), true);
  assert.equal(canChangeRegistration("full", "none"), true); // Warteliste
  assert.equal(canChangeRegistration("closed", "none"), false);
  assert.equal(canChangeRegistration("closed", "registered"), true); // Abmelden bleibt möglich
  assert.equal(canChangeRegistration("closed", "waitlisted"), true); // Austragen bleibt möglich
  assert.equal(canChangeRegistration("ended", "registered"), false);
});

test("Kapazität: Anzeige, ausgebucht und Eingabe", () => {
  assert.equal(capacityLabel(12, null), null);
  assert.equal(capacityLabel(12, 30), "12 von 30 Plätzen belegt");
  assert.equal(capacityLabel(30, 30), "Ausgebucht");
  assert.equal(isEventFull({ max_participants: null }, 1000), false);
  assert.equal(isEventFull({ max_participants: 2 }, 2), true);

  assert.equal(parseMaxParticipants(""), null);
  assert.equal(parseMaxParticipants("  "), null);
  assert.equal(parseMaxParticipants("40"), 40);
  assert.equal(parseMaxParticipants(" 1 "), 1);
  assert.equal(parseMaxParticipants("10000"), 10000);
  assert.equal(parseMaxParticipants("0"), undefined);
  assert.equal(parseMaxParticipants("10001"), undefined);
  assert.equal(parseMaxParticipants("-5"), undefined);
  assert.equal(parseMaxParticipants("2.5"), undefined);
  assert.equal(parseMaxParticipants("1e3"), undefined);
});
