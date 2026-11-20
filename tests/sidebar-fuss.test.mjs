// Seitenleiste unten (Klickrunde 20.11.2026): kein Schriftzug „Darstellung“, Umschalter Hell/Dunkel/System in einer
// Zeile rechts neben Impressum/Datenschutz, Desktop und mobiles Menü (beide über renderFooter). Quelltext-Prüfung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (pfad) => readFileSync(new URL(`../${pfad}`, import.meta.url), "utf8");

test("Umschalter ohne sichtbaren Schriftzug, benannt über aria-label/title", () => {
  const quelle = lies("components/theme/theme-toggle.tsx");
  assert.doesNotMatch(quelle, />\s*Darstellung\s*</);
  assert.match(quelle, /role="radiogroup"\s+aria-label="Darstellung"/);
  assert.match(quelle, /aria-label=\{label\}\s+title=\{label\}/);
  assert.match(quelle, /useReducedMotionSafe/);
});

test("Seitenleiste: Rechtliches links, Umschalter rechts in einer Zeile, für Desktop und Handy", () => {
  const quelle = lies("components/layout/Sidebar.tsx");
  assert.match(
    quelle,
    /<div className="[^"]*\bflex\b[^"]*\bjustify-between\b[^"]*">\s*<LegalLinks[^>]*\/>\s*<ThemeToggle[^>]*\/>\s*<\/div>/,
  );
  assert.equal(quelle.match(/<ThemeToggle\b/g).length, 1);
  assert.match(quelle, /renderFooter\("desktop"\)/);
  assert.match(quelle, /renderFooter\("mobile"/);
});

test("Umschalter: Klickfläche je Knopf 40 × 40 px ohne Überlappung, Optik 28 px innerhalb der Klickfläche", () => {
  const quelle = lies("components/theme/theme-toggle.tsx");
  // Knopf = Klickfläche 40 px (size-10), lückenlos nebeneinander (Gruppe ohne gap), sichtbare Fläche 28 px (size-7).
  assert.match(quelle, /"group relative flex size-10 items-center justify-center outline-none"/);
  assert.match(quelle, /className=\{cn\("relative -mx-2\.5 -my-1 flex shrink-0", className\)\}/);
  assert.doesNotMatch(quelle, /flex shrink-0[^"]*\bgap-/);
  assert.match(quelle, /<span className="relative flex size-7 /);
  // Schiene nur Optik, so weit eingerückt wie der negative Rand (Layout so klein wie die Schiene).
  assert.match(quelle, /<span aria-hidden className="absolute inset-x-2\.5 inset-y-1 rounded-lg bg-sidebar-accent" \/>/);
  // Außen liegende Flächen an der Innenkante: 28-px-Optik liegt ganz in der eigenen 40-px-Klickfläche.
  assert.match(quelle, /key === "light" \? "justify-end" : key === "system" \? "justify-start"/);
  // Fokus sichtbar an der Optik.
  assert.match(quelle, /group-focus-visible:ring-\[3px\]/);
  // Abstand zu den Links mindestens so groß wie der Überstand der Klickflächen (gap-2.5 = 10 px).
  const leiste = lies("components/layout/Sidebar.tsx");
  assert.match(leiste, /flex items-center justify-between gap-2\.5 pl-1/);
  // Eine Zeile, auch am Desktop: Links brechen nie um.
  assert.match(leiste, /<LegalLinks className="[^"]*flex-nowrap[^"]*whitespace-nowrap[^"]*" \/>/);
});

test("Seitenleiste: Links + Umschalter passen in die Desktop-Zeile (Breiten gemessen mit Inter, 20.11.2026)", () => {
  const leiste = 17 * 16; // w-[17rem], inkl. 1 px Rand
  const zeile = leiste - 1 - 2 * 12 - 4; // border-r, px-3 im Fuß, pl-1
  const links = 57.5 + 65.3 + 6; // „Impressum“ + „Datenschutz“ bei 11 px Inter, gap-x-1.5
  const umschalter = 3 * 40 - 2 * 10; // Klickflächen minus Überstand (-mx-2.5)
  assert.ok(links + 10 + umschalter <= zeile, `${links + 10 + umschalter} > ${zeile}`);
  assert.match(lies("components/layout/Sidebar.tsx"), /w-\[17rem\]/);
});
