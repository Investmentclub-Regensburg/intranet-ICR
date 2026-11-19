// Tests für das Aufklappen der Seitenleiste (components/layout/nav-open.ts) und die Bereiche von „Mein Profil“
// (components/profile/tabs.ts), Design-Runde 19.11.2026. Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFILE_SECTION, pathMatches, sectionForPath, toggleSection } from "../components/layout/nav-open.ts";
import {
  PROFILE_TABS,
  profileTabFromParam,
  profileTabHref,
  profileTabTitle,
} from "../components/profile/tabs.ts";

// Wie in Sidebar.tsx: Schlüssel = href des Bereichs, Pfade = href + match.
const SECTIONS = [
  { key: "/events", paths: ["/events", "/calendar"] },
  { key: "/whatsapp", paths: ["/whatsapp", "/members", "/board-members"] },
  { key: "/admin", paths: ["/admin", "/insights"] },
  { key: PROFILE_SECTION, paths: ["/profile"] },
];

test("pathMatches: genau oder darunter, kein bloßer Präfix", () => {
  assert.equal(pathMatches("/events", ["/events"]), true);
  assert.equal(pathMatches("/events/abc", ["/events"]), true);
  assert.equal(pathMatches("/eventsx", ["/events"]), false);
});

test("sectionForPath: Bereich der aktuellen Seite (auch Unterseiten), sonst keiner", () => {
  assert.equal(sectionForPath("/calendar", SECTIONS), "/events");
  assert.equal(sectionForPath("/events/0b7c4a7e", SECTIONS), "/events");
  assert.equal(sectionForPath("/members/satzung", SECTIONS), "/whatsapp");
  assert.equal(sectionForPath("/board-members", SECTIONS), "/whatsapp");
  assert.equal(sectionForPath("/admin/members", SECTIONS), "/admin");
  assert.equal(sectionForPath("/insights", SECTIONS), "/admin");
  assert.equal(sectionForPath("/profile", SECTIONS), PROFILE_SECTION);
  // Bereiche ohne Unterseiten halten nichts offen.
  for (const p of ["/dashboard", "/news", "/magazines", "/"]) assert.equal(sectionForPath(p, SECTIONS), null, p);
});

test("toggleSection: zu → auf, auf → zu, anderer Bereich schließt den vorigen", () => {
  assert.equal(toggleSection(null, "/events"), "/events");
  assert.equal(toggleSection("/events", "/events"), null);
  assert.equal(toggleSection("/events", "/admin"), "/admin");
  assert.equal(toggleSection("/admin", PROFILE_SECTION), PROFILE_SECTION);
  assert.equal(toggleSection(PROFILE_SECTION, PROFILE_SECTION), null);
});

test("Profil-Bereiche: Reihenfolge, Unterpunkte und Titel", () => {
  assert.deepEqual(
    PROFILE_TABS.map((t) => [t.key, t.label, t.title]),
    [
      ["daten", "Meine Daten", "Meine Daten"],
      ["mitgliedschaft", "Mitgliedschaft", "Meine Mitgliedschaft"],
      ["veranstaltungen", "Veranstaltungen", "Meine Veranstaltungen"],
    ],
  );
  assert.equal(profileTabTitle("mitgliedschaft"), "Meine Mitgliedschaft");
});

test("profileTabFromParam: ohne tab, alter Überblick und Unbekanntes zeigen Meine Daten", () => {
  for (const v of [null, undefined, "", "ueberblick", "daten", "UEBERBLICK", "x", 3]) {
    assert.equal(profileTabFromParam(v), "daten", String(v));
  }
  assert.equal(profileTabFromParam("mitgliedschaft"), "mitgliedschaft");
  assert.equal(profileTabFromParam("veranstaltungen"), "veranstaltungen");
});

test("profileTabHref: Meine Daten ohne Parameter, sonst ?tab=…", () => {
  assert.equal(profileTabHref("daten"), "/profile");
  assert.equal(profileTabHref("mitgliedschaft"), "/profile?tab=mitgliedschaft");
  assert.equal(profileTabHref("veranstaltungen"), "/profile?tab=veranstaltungen");
});

test("keine Links mehr auf den entfallenen Überblick", () => {
  for (const datei of [
    "../components/layout/Sidebar.tsx",
    "../components/profile/MembershipSection.tsx",
    "../components/profile/ProfileTabs.tsx",
    "../app/(intranet)/profile/page.tsx",
    "../app/auth/confirm/route.ts",
  ]) {
    const code = readFileSync(new URL(datei, import.meta.url), "utf8");
    assert.ok(!code.includes("ueberblick"), datei);
    assert.ok(!code.includes("ProfileOverview"), datei);
  }
});

test("E-Mail-Formular liegt nicht im Abschnittsformular (kein <form> im <form>)", () => {
  const code = readFileSync(new URL("../components/profile/ProfileDataSections.tsx", import.meta.url), "utf8");
  // Felder im Kasten hängen per form-Attribut am eigenen Formular, das nach </EditForm> steht.
  assert.match(code, /form=\{email\.formId\}/);
  const ende = code.indexOf("</EditForm>");
  const eigenesFormular = code.indexOf("<form id={email.formId}");
  assert.ok(ende > 0 && eigenesFormular > ende, "E-Mail-Formular muss hinter dem Abschnittsformular stehen");
});
