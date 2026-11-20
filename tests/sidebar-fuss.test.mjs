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
