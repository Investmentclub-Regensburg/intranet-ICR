// Prüfregel zur Abfrage „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4, Gegenprüfung S-G1): Jede Seite,
// jedes Layout/Template und jedes generateMetadata/generateViewport unter app/(intranet) – auch künftige – ruft als
// erste Anweisung `await sperreBeiDatenmaengeln()` auf. Grund: Next rendert die Seite parallel zum Layout und
// überträgt sie als eigenen RSC-Eintrag; die Weiterleitung im Layout allein hält den Seiteninhalt nicht zurück.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = fileURLToPath(new URL("..", import.meta.url));
const INTRANET = join(WURZEL, "app", "(intranet)");
const SPERRE_IMPORT = /^import \{[^}]*\bsperreBeiDatenmaengeln\b[^}]*\} from "@\/lib\/member-data-check-sperre";$/m;
const SPERRE_AUFRUF = "await sperreBeiDatenmaengeln();";
/** Routen-Dateien, deren Standard-Export rendert (Seite bzw. Rahmen um die Seite). */
const RENDER_DATEI = /^(page|layout|template|default)\.(tsx|ts|jsx|js|mdx)$/;

function dateien(ordner) {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? dateien(join(ordner, e.name)) : [join(ordner, e.name)],
  );
}

/** Kommentare entfernen (grob, reicht für den Anfang eines Funktionskörpers). */
function ohneKommentare(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Erste Anweisung im Körper der Funktion, die bei `start` (Index des Schlüsselworts) beginnt. */
function ersteAnweisung(code, start) {
  let i = code.indexOf("(", start);
  if (i < 0) return null;
  let tiefe = 0;
  for (; i < code.length; i++) {
    if (code[i] === "(") tiefe++;
    else if (code[i] === ")" && --tiefe === 0) break;
  }
  const koerper = code.indexOf("{", i);
  // Zwischen Parameterliste und Körper darf nur ein Rückgabetyp stehen (kein Pfeil, keine Klammer).
  const zwischen = code.slice(i + 1, koerper).trim();
  if (zwischen !== "" && !/^:[^{=]*$/.test(zwischen)) return null;
  const rest = code.slice(koerper + 1).trimStart();
  return rest.slice(0, rest.indexOf(";") + 1);
}

/** Fehlerliste für eine Routen-Datei (leer = in Ordnung). */
export function pruefeRoutenDatei(name, quelltext) {
  const code = ohneKommentare(quelltext);
  const fehler = [];
  if (/^\s*["']use client["']/.test(code)) fehler.push(`${name}: Client-Komponente als Route (Sperre läuft nur auf dem Server)`);
  const istRender = RENDER_DATEI.test(name.split(/[\\/]/).pop());
  const funktionen = [];
  if (istRender) {
    const m = /export default (async )?function\b/.exec(code);
    if (!m) fehler.push(`${name}: Standard-Export muss \`export default async function\` sein`);
    else if (!m[1]) fehler.push(`${name}: Standard-Export muss async sein`);
    else funktionen.push(["Standard-Export", m.index]);
  }
  for (const art of ["generateMetadata", "generateViewport"]) {
    if (!new RegExp(`\\b${art}\\b`).test(code)) continue;
    const m = new RegExp(`export async function ${art}\\b`).exec(code);
    if (!m) fehler.push(`${name}: ${art} muss \`export async function ${art}\` sein`);
    else funktionen.push([art, m.index]);
  }
  for (const [art, index] of funktionen) {
    const erste = ersteAnweisung(code, index);
    if (erste !== SPERRE_AUFRUF) fehler.push(`${name}: ${art} beginnt nicht mit ${SPERRE_AUFRUF} (sondern: ${erste ?? "?"})`);
  }
  if (funktionen.length > 0 && !SPERRE_IMPORT.test(code)) fehler.push(`${name}: Import aus @/lib/member-data-check-sperre fehlt`);
  return fehler;
}

test("S-G1: jede Seite, jedes Layout und jedes generateMetadata unter app/(intranet) ruft zuerst die Sperre auf", () => {
  const alle = dateien(INTRANET).filter((d) => /\.(tsx|ts|jsx|js|mdx)$/.test(d));
  const routen = alle.filter((d) => {
    const name = d.split(/[\\/]/).pop();
    return RENDER_DATEI.test(name) || /\b(generateMetadata|generateViewport)\b/.test(readFileSync(d, "utf8"));
  });
  const seiten = routen.filter((d) => /[\\/]page\.\w+$/.test(d));
  // Nicht leer laufen: Stand 19.11.2026 sind es 21 Seiten.
  assert.ok(seiten.length >= 21, `nur ${seiten.length} Seiten gefunden`);
  const fehler = routen.flatMap((d) => pruefeRoutenDatei(relative(WURZEL, d), readFileSync(d, "utf8")));
  assert.deepEqual(fehler, []);
  // Ohne loading.tsx rendert ein Prefetch die Seite nicht vor (sonst hier neu bewerten).
  assert.deepEqual(alle.filter((d) => /[\\/]loading\.\w+$/.test(d)), []);
});

test("S-G1: die Prüfregel erkennt fehlende, späte und versteckte Aufrufe", () => {
  const imp = 'import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";\n';
  const gut = `${imp}export default async function P({ params }: { params: Promise<{ id: string }> }) {\n  // Kommentar\n  ${SPERRE_AUFRUF}\n  return null;\n}\n`;
  assert.deepEqual(pruefeRoutenDatei("x/page.tsx", gut), []);
  const metaGut = `${gut}export async function generateMetadata({ params }: Props): Promise<Metadata> {\n  ${SPERRE_AUFRUF}\n  return {};\n}\n`;
  assert.deepEqual(pruefeRoutenDatei("x/page.tsx", metaGut), []);
  // fehlt
  assert.equal(pruefeRoutenDatei("x/page.tsx", `${imp}export default async function P() {\n  return null;\n}\n`).length, 1);
  // nicht als erste Anweisung
  assert.equal(
    pruefeRoutenDatei("x/page.tsx", `${imp}export default async function P() {\n  const a = await f();\n  ${SPERRE_AUFRUF}\n}\n`).length,
    1,
  );
  // nur im Kommentar
  assert.equal(pruefeRoutenDatei("x/page.tsx", `${imp}export default async function P() {\n  // ${SPERRE_AUFRUF}\n  return null;\n}\n`).length, 1);
  // nicht async / Pfeilfunktion
  assert.equal(pruefeRoutenDatei("x/page.tsx", `${imp}export default function P() {\n  return null;\n}\n`).length, 1);
  assert.equal(pruefeRoutenDatei("x/page.tsx", `${imp}const P = async () => null;\nexport default P;\n`).length, 1);
  // generateMetadata ohne Sperre bzw. als Pfeilfunktion
  assert.equal(pruefeRoutenDatei("x/page.tsx", `${gut}export async function generateMetadata() {\n  return {};\n}\n`).length, 1);
  assert.equal(pruefeRoutenDatei("x/page.tsx", `${gut}export const generateMetadata = async () => ({});\n`).length, 1);
  // ohne Import
  assert.equal(pruefeRoutenDatei("x/page.tsx", gut.replace(imp, "")).length, 1);
  // Client-Komponente
  assert.ok(pruefeRoutenDatei("x/page.tsx", `"use client";\n${gut}`).length >= 1);
});

test("S-G1: Sperre leitet nur bei fällig + ungültig um, je Anfrage einmal berechnet", () => {
  const sperre = readFileSync(new URL("../lib/member-data-check-sperre.ts", import.meta.url), "utf8");
  assert.match(sperre, /^import "server-only";$/m);
  assert.match(sperre, /export const eigenerDatenCheck = cache\(/);
  assert.match(sperre, /export const sperreBeiDatenmaengeln = cache\(/);
  assert.match(sperre, /if \(datenCheck && !datenCheck\.gueltig\) redirect\(DATEN_CHECK_PFAD\);/);
  // Fälligkeit aus getCachedAuth (keine zusätzliche Abfrage), Entschlüsseln nur in faelligerDatenCheck (nur wenn fällig).
  assert.match(sperre, /await getCachedAuth\(\)/);
  assert.match(sperre, /faelligerDatenCheck\(/);
  assert.doesNotMatch(sperre, /readMemberSecrets|\.from\(/);
  // Layout und /daten-bestaetigen nutzen dieselbe berechnete Ansicht (einmal entschlüsseln je Anfrage).
  const layout = readFileSync(new URL("../app/(intranet)/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /await eigenerDatenCheck\(\)/);
  assert.doesNotMatch(layout, /faelligerDatenCheck/);
  const seite = readFileSync(new URL("../app/daten-bestaetigen/page.tsx", import.meta.url), "utf8");
  assert.match(seite, /await eigenerDatenCheck\(\)/);
  assert.doesNotMatch(seite, /faelligerDatenCheck/);
});
