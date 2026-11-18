// Auswertung für scripts/datenqualitaet.mjs (Paket „Mitgliederdaten“, PR 3): rein, ohne Datenbank und ohne
// Umgebung, damit sie mit erfundenen Daten getestet werden kann (tests/datenqualitaet.test.mjs).
//
// Grundsatz: Alles, was hier formatiert wird, enthält nur Zahlen, Feldnamen und Codes – nie Werte, Namen,
// E-Mails oder Profil-IDs. Einzige Ausnahme ist die TSV-Liste (`listeTsv`), die nur auf ausdrücklichen Wunsch
// (`--liste <datei>`) und nur außerhalb des Repos geschrieben wird: Profil-ID + Codes, keine Werte.
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  HINWEIS_CODES,
  MANGEL_CODES,
  STAMMFELDER,
  pruefeBestand,
  repariereMitgliederdaten,
} from "../../lib/member-rules.ts";
import { isActiveMemberProfile, isAlumniProfile, isCancelledProfile } from "../../lib/profile-status.ts";
import { normalizeIban } from "../../lib/member-crypto.ts";

/**
 * Verschlüsselte Felder, die das Skript aus member_secrets liest und prüft (= SECRET_FIELDS vor PR 2).
 * ▶ Nach dem Merge von PR 2 (neues Feld `land`) hier "land" ergänzen. Fehlt `land`, gilt beim Prüfen DE.
 */
export const GESPEICHERTE_FELDER = Object.freeze([
  "iban",
  "bic",
  "geburtsdatum",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "handynummer",
]);

/**
 * Felder, die das Skript automatisch ändern darf – und nur mit Status „sicher“ (Konzept Abschnitt 3,
 * Entscheidung 6): Handy → E.164, Straße/Hausnummer abtrennen, BIC mit falschem Format leeren.
 * Alles andere (auch die IBAN-Schreibweise) bleibt unangetastet.
 */
export const SCHREIBBARE_FELDER = Object.freeze(["handynummer", "strasse", "hausnummer", "bic"]);

/** Felder in der Ausgabe (Reihenfolge der Gesamtprüfung, inkl. `land`). */
export const AUSGABE_FELDER = Object.freeze([...STAMMFELDER]);

export const STATUS = Object.freeze(["gueltig", "sicher", "vorschlag", "offen"]);

/** Gruppe eines Profils: nur „aktiv“ (inkl. Vorstand und Alumni) wird bewertet und ggf. geändert. */
export function gruppeVon(profil) {
  if (isActiveMemberProfile(profil)) return "aktiv";
  return isCancelledProfile(profil) ? "gekuendigt" : "antrag_offen";
}

/**
 * Ein Profil bewerten.
 *   profil    Zeile aus profiles (`Status`, `Rolle`)
 *   werte     entschlüsselte Felder (MemberSecretValues) oder "unreadable"
 *   hatZeile  gibt es eine member_secrets-Zeile?
 *   heute     YYYY-MM-DD (nur Tests)
 * Liefert Gruppe, Mängel, Hinweise, Status je Feld und die Änderungen, die `reparieren` schreiben darf
 * (`aenderungen`, nur bei Gruppe „aktiv“, nur SCHREIBBARE_FELDER mit Status „sicher“).
 */
export function bewerteProfil({ profil, werte, hatZeile, heute }) {
  const gruppe = gruppeVon(profil);
  const alumni = isAlumniProfile(profil);
  const basis = { gruppe, alumni, hatZeile: Boolean(hatZeile), lesbar: true, maengel: [], hinweise: [], status: {}, aenderungen: {} };
  if (werte === "unreadable") return { ...basis, lesbar: false };

  const daten = {};
  for (const feld of GESPEICHERTE_FELDER) daten[feld] = werte?.[feld] ?? null;
  const kontext = heute ? { alumni, wer: "mitglied", heute } : { alumni, wer: "mitglied" };

  // Ohne `handyLand` (regeln-fuer-aufrufer.md Punkt 1): sonst fehlt der Hinweis `vorwahl_ergaenzt`.
  const pruefung = pruefeBestand(daten, kontext);
  const reparatur = repariereMitgliederdaten(daten, kontext);
  const maengel = eindeutigeMaengel(pruefung.maengel);
  const mangelFelder = new Set(maengel.map((m) => m.feld));

  // Kandidaten: SCHREIBBARE_FELDER mit Reparatur „sicher“, deren Wert sich wirklich ändert. Straße und
  // Hausnummer kommen aus einer Reparatur (Abtrennen oder nur Bereinigen, Regelwerk K2).
  const kandidaten = {};
  for (const feld of SCHREIBBARE_FELDER) {
    const quelle = feld === "hausnummer" ? "strasse" : feld;
    if (reparatur.status[quelle] !== "sicher") continue;
    const wert = reparatur.sicher[feld];
    if (typeof wert === "string" && wert !== (daten[feld] ?? "")) kandidaten[feld] = wert;
  }

  // Gegenprobe: Jedes geänderte Feld muss danach mangelfrei sein. Straße und Hausnummer nur gemeinsam
  // (Review P4): hat eines danach einen Mangel, wird keines von beiden geschrieben.
  const verworfen = Object.keys(kandidaten).length
    ? gegenprobe(kandidaten, new Set(pruefeBestand({ ...daten, ...kandidaten }, kontext).maengel.map((m) => m.feld)))
    : new Set();

  const status = {};
  for (const feld of AUSGABE_FELDER) {
    // „sicher“ nur für Felder, die das Skript tatsächlich ändert (IBAN nie; die Prüfung normalisiert ohnehin).
    if (feld in kandidaten) status[feld] = verworfen.has(feld) ? "offen" : "sicher";
    else if (reparatur.status[feld] === "vorschlag") status[feld] = "vorschlag";
    else status[feld] = mangelFelder.has(feld) ? "offen" : "gueltig";
  }

  const aenderungen = {};
  if (gruppe === "aktiv") {
    for (const [feld, wert] of Object.entries(kandidaten)) if (!verworfen.has(feld)) aenderungen[feld] = wert;
  }

  return { ...basis, maengel, hinweise: pruefung.hinweise, status, aenderungen };
}

/**
 * Gegenprobe nach der Reparatur: verworfen wird jedes Feld, das danach noch einen Mangel hat. Straße und
 * Hausnummer gehören zusammen (Review P4): hat eines von beiden danach einen Mangel, wird keines geschrieben.
 *   kandidaten  geplante Änderungen { feld: wert }
 *   nochMangel  Felder mit Mangel im Datensatz NACH den Änderungen
 */
export function gegenprobe(kandidaten, nochMangel) {
  const verworfen = new Set(Object.keys(kandidaten).filter((f) => nochMangel.has(f)));
  const paar = ["strasse", "hausnummer"].filter((f) => f in kandidaten);
  if (paar.length && (nochMangel.has("strasse") || nochMangel.has("hausnummer"))) {
    for (const f of paar) verworfen.add(f);
  }
  return verworfen;
}

/**
 * Mängel je Profil eindeutig (regeln-fuer-aufrufer.md Punkt 4): `land_unbekannt` steht im Regelwerk an `land`
 * UND `plz` – gezählt und angezeigt wird er nur am Feld `land`.
 */
export function eindeutigeMaengel(maengel) {
  const landUnbekannt = maengel.some((m) => m.feld === "land" && m.code === "land_unbekannt");
  if (!landUnbekannt) return maengel;
  return maengel.filter((m) => !(m.feld === "plz" && m.code === "land_unbekannt"));
}

// ---------------------------------------------------------------------------------------------------
// Zählen
// ---------------------------------------------------------------------------------------------------

export function neueZaehlung() {
  const status = {};
  for (const feld of AUSGABE_FELDER) status[feld] = Object.fromEntries(STATUS.map((s) => [s, 0]));
  return {
    profile: 0,
    aktiv: 0,
    alumni: 0,
    gekuendigt: 0,
    antragOffen: 0,
    ohneZeileAktiv: 0,
    ohneZeileGesamt: 0,
    nichtLesbar: 0,
    aktivMitMangel: 0,
    aktivMitHinweis: 0,
    nichtBetroffenMitMangel: 0,
    /** feld → code → Anzahl (nur aktive Profile) */
    maengel: {},
    /** feld → code → Anzahl (nur aktive Profile) */
    hinweise: {},
    /** feld → Status → Anzahl (nur aktive, lesbare Profile) */
    status,
    /** Profile, die `reparieren` ändern würde */
    zuAendern: 0,
    /** feld → Anzahl geplanter Änderungen */
    aenderungenJeFeld: {},
  };
}

function erhoehe(tabelle, feld, code) {
  tabelle[feld] ??= {};
  tabelle[feld][code] = (tabelle[feld][code] ?? 0) + 1;
}

export function zaehle(z, b) {
  z.profile++;
  if (!b.hatZeile) z.ohneZeileGesamt++;
  if (b.gruppe === "gekuendigt") z.gekuendigt++;
  if (b.gruppe === "antrag_offen") z.antragOffen++;
  if (b.gruppe !== "aktiv") {
    if (b.maengel.length || !b.lesbar) z.nichtBetroffenMitMangel++;
    if (!b.lesbar) z.nichtLesbar++;
    return z;
  }
  z.aktiv++;
  if (b.alumni) z.alumni++;
  if (!b.hatZeile) z.ohneZeileAktiv++;
  if (!b.lesbar) {
    z.nichtLesbar++;
    return z;
  }
  if (b.maengel.length) z.aktivMitMangel++;
  if (b.hinweise.length) z.aktivMitHinweis++;
  for (const m of eindeutigeMaengel(b.maengel)) erhoehe(z.maengel, m.feld, m.code);
  for (const h of b.hinweise) erhoehe(z.hinweise, h.feld, h.code);
  for (const feld of AUSGABE_FELDER) z.status[feld][b.status[feld]]++;
  const felder = Object.keys(b.aenderungen);
  if (felder.length) {
    z.zuAendern++;
    for (const feld of felder) z.aenderungenJeFeld[feld] = (z.aenderungenJeFeld[feld] ?? 0) + 1;
  }
  return z;
}

export function zaehleAlle(bewertungen) {
  const z = neueZaehlung();
  for (const b of bewertungen) zaehle(z, b);
  return z;
}

// ---------------------------------------------------------------------------------------------------
// Ausgabe (nur Zahlen, Feldnamen, Codes)
// ---------------------------------------------------------------------------------------------------

const zahl = (n) => String(Number.isFinite(n) ? n : 0);
const zeile = (label, n, breite = 56) => `  ${label.padEnd(breite)} ${zahl(n).padStart(5)}`;

function codeTabelle(tabelle, codes) {
  const zeilen = [];
  for (const feld of AUSGABE_FELDER) {
    for (const code of codes) {
      const n = tabelle[feld]?.[code];
      if (n) zeilen.push(`  ${feld.padEnd(14)} ${code.padEnd(24)} ${zahl(n).padStart(5)}`);
    }
  }
  return zeilen.length ? zeilen : ["  keine"];
}

function kopf(z) {
  return [
    zeile("Profile gesamt", z.profile),
    zeile("betroffen (aktiv inkl. Vorstand und Alumni)", z.aktiv),
    zeile("  davon Alumni", z.alumni),
    zeile("  davon ohne member_secrets-Zeile", z.ohneZeileAktiv),
    zeile("nicht betroffen: gekündigt (nur gezählt)", z.gekuendigt),
    zeile("nicht betroffen: Antrag offen (nur gezählt)", z.antragOffen),
    zeile("gekündigt + Antrag offen: mit Mangel oder nicht lesbar", z.nichtBetroffenMitMangel),
    zeile("Profile ohne member_secrets-Zeile (alle)", z.ohneZeileGesamt),
    zeile("nicht lesbar (alle)", z.nichtLesbar),
  ];
}

/** Ausgabe von `pruefen`. */
export function formatierePruefung(z) {
  return [
    "Prüfung (nur Zählungen)",
    ...kopf(z),
    zeile("betroffene Profile mit mindestens einem Mangel", z.aktivMitMangel),
    zeile("betroffene Profile mit Hinweis", z.aktivMitHinweis),
    "",
    "Mängel je Feld und Code (betroffene Profile)",
    ...codeTabelle(z.maengel, MANGEL_CODES),
    "",
    "Hinweise je Feld (blockieren nicht)",
    ...codeTabelle(z.hinweise, HINWEIS_CODES),
  ].join("\n");
}

/** Ausgabe von `reparieren --probelauf` (und vor `reparieren`). */
export function formatiereProbelauf(z) {
  const kopfzeile = `  ${"Feld".padEnd(14)} ${STATUS.map((s) => s.padStart(9)).join(" ")}`;
  const zeilen = AUSGABE_FELDER.map(
    (feld) => `  ${feld.padEnd(14)} ${STATUS.map((s) => zahl(z.status[feld][s]).padStart(9)).join(" ")}`
  );
  const geplant = SCHREIBBARE_FELDER.map((feld) => zeile(`  ${feld}`, z.aenderungenJeFeld[feld] ?? 0));
  return [
    "Probelauf (ändert nichts)",
    ...kopf(z),
    "",
    "Status je Feld (betroffene, lesbare Profile)",
    "  gueltig = in Ordnung, sicher = wird automatisch korrigiert, vorschlag = Mitglied bestätigt, offen = Mitglied/Vorstand korrigiert",
    kopfzeile,
    ...zeilen,
    "",
    zeile("Profile, die „reparieren“ ändern würde", z.zuAendern),
    ...geplant,
  ].join("\n");
}

/** Ergebnis von `reparieren`. */
export function neuesReparaturErgebnis() {
  return {
    geplant: 0,
    geaendert: 0,
    felder: {},
    konflikt: 0,
    ibanAbgleich: 0,
    nichtLesbar: 0,
    inzwischenErledigt: 0,
    fehler: 0,
    abgebrochen: false,
    bearbeitet: 0,
  };
}

export function formatiereReparatur(r) {
  return [
    r.abgebrochen ? `Reparatur abgebrochen nach ${zahl(r.bearbeitet)} von ${zahl(r.geplant)} Profilen (Strg+C)` : "Reparatur fertig",
    zeile("Profile geändert", r.geaendert),
    ...SCHREIBBARE_FELDER.map((feld) => zeile(`  ${feld}`, r.felder[feld] ?? 0)),
    zeile("übersprungen: Versionskonflikt (nicht wiederholt)", r.konflikt),
    zeile("übersprungen: IBAN-Fingerabdruck passt nicht", r.ibanAbgleich),
    zeile("übersprungen: inzwischen nichts mehr zu tun", r.inzwischenErledigt),
    zeile("übersprungen: nicht lesbar", r.nichtLesbar),
    zeile("Fehler", r.fehler),
  ].join("\n");
}

/**
 * TSV für `--liste`: Profil-ID, Gruppe, Zeile (ja/nein/nicht_lesbar), Mängel (feld:code), Hinweise,
 * Vorschläge (Feldnamen), automatisch (Feldnamen). Keine Werte. Nur Profile mit Befund.
 */
export function listeTsv(eintraege) {
  const zeilen = [["profil_id", "gruppe", "zeile", "maengel", "hinweise", "vorschlaege", "automatisch"].join("\t")];
  for (const { id, bewertung: b } of eintraege) {
    const vorschlaege = Object.keys(b.status).filter((f) => b.status[f] === "vorschlag");
    const automatisch = Object.keys(b.aenderungen);
    const befund = !b.lesbar || !b.hatZeile || b.maengel.length || b.hinweise.length || vorschlaege.length || automatisch.length;
    if (!befund) continue;
    zeilen.push(
      [
        String(id),
        b.gruppe,
        !b.lesbar ? "nicht_lesbar" : b.hatZeile ? "ja" : "nein",
        b.maengel.map((m) => `${m.feld}:${m.code}`).join(","),
        b.hinweise.map((h) => `${h.feld}:${h.code}`).join(","),
        vorschlaege.join(","),
        automatisch.join(","),
      ].join("\t")
    );
  }
  return `${zeilen.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------
// Argumente, Ziel, Pfade
// ---------------------------------------------------------------------------------------------------

/** Supabase-Projekte (Cloud) wie in scripts/verschluesselung.mjs; „lokal“ = lokaler Stack (nur mit --url). */
export const PROJEKTE = Object.freeze({
  prod: "vxcwtfktnefreboejgpw",
  test: "rkegvieoejmyutkowwwf",
  lokal: null,
});
export const BEFEHLE = Object.freeze(["pruefen", "reparieren"]);
const WERT_FLAGS = ["--projekt", "--url", "--vorstand", "--liste"];
const SCHALTER = ["--probelauf"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** Dokumentierter SSH-Tunnel zur Produktion (README „Betrieb auf eigenem Server“) – nie als „lokal“. */
const PROD_TUNNEL_PORT = "8100";

/** Eigene Supabase-URL: nur http(s), ohne Pfad. Liefert { origin, host } oder { fehler }. */
export function normalisiereUrl(roh) {
  let parsed;
  try {
    parsed = new URL(String(roh).trim());
  } catch {
    return { fehler: "--url bzw. ICR_SUPABASE_URL ist keine gültige Adresse." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { fehler: "--url bzw. ICR_SUPABASE_URL muss mit http:// oder https:// beginnen." };
  }
  if (parsed.pathname.replace(/\/+$/, "") || parsed.search || parsed.hash || parsed.username || parsed.password) {
    return { fehler: "--url bzw. ICR_SUPABASE_URL ohne Pfad angeben, z. B. http://localhost:8100" };
  }
  return { origin: parsed.origin, host: parsed.hostname };
}

/** Liegt `kind` in `eltern` (oder ist gleich)? Unter Windows ohne Groß-/Kleinschreibung. */
export function liegtIn(kind, eltern, plattform = process.platform) {
  const p = plattform === "win32" ? path.win32 : path.posix;
  const norm = (x) => (plattform === "win32" ? p.resolve(x).toLowerCase() : p.resolve(x));
  const rel = p.relative(norm(eltern), norm(kind));
  return rel === "" || (!rel.startsWith("..") && !p.isAbsolute(rel));
}

/** Echter Pfad (Symlinks aufgelöst) der Datei bzw. ihres nächsten vorhandenen Elternordners. */
function echterPfad(pfad) {
  let aktuell = path.resolve(pfad);
  const rest = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(aktuell), ...rest.reverse());
    } catch {
      const eltern = path.dirname(aktuell);
      if (eltern === aktuell) return path.resolve(pfad);
      rest.push(path.basename(aktuell));
      aktuell = eltern;
    }
  }
}

/** Ist der Pfad für `--liste` erlaubt (außerhalb des Repos)? */
export function listePfadErlaubt(pfad, repoWurzel) {
  return !liegtIn(echterPfad(pfad), echterPfad(repoWurzel)) && !liegtIn(path.resolve(pfad), repoWurzel);
}

/**
 * Kommandozeile lesen. Liefert { fehler } oder
 * { befehl, probelauf, projekt, ref, url, ziel, vorstand, liste }.
 *   url   Supabase-Adresse (Cloud aus --projekt oder eigener Server/lokal aus --url)
 *   ziel  was zum Bestätigen eingetippt wird (Projekt-Ref bzw. Adresse)
 */
export function leseArgumente(argv, env = {}, repoWurzel = null) {
  const werte = {};
  const positionen = [];
  const schalter = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WERT_FLAGS.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return { fehler: `${a} braucht einen Wert.` };
      if (Object.hasOwn(werte, a)) return { fehler: `${a} ist doppelt angegeben.` };
      werte[a] = v;
      i++;
    } else if (SCHALTER.includes(a)) {
      schalter.add(a);
    } else if (a.startsWith("--")) {
      return { fehler: `Unbekannte Option. Erlaubt: ${[...WERT_FLAGS, ...SCHALTER].join(", ")}` };
    } else {
      positionen.push(a);
    }
  }
  const befehl = positionen[0];
  if (positionen.length !== 1 || !BEFEHLE.includes(befehl)) {
    return { fehler: `Genau einen Befehl angeben: ${BEFEHLE.join(", ")}` };
  }
  const probelauf = schalter.has("--probelauf");
  if (probelauf && befehl !== "reparieren") return { fehler: "--probelauf gibt es nur bei „reparieren“." };

  const projekt = werte["--projekt"];
  if (!projekt || !Object.hasOwn(PROJEKTE, projekt)) {
    return { fehler: "--projekt prod, --projekt test oder --projekt lokal (mit --url) angeben." };
  }
  // „lokal“ nur mit ausdrücklichem --url (Review P1): ein dauerhaft gesetztes ICR_SUPABASE_URL (Prod-Tunnel)
  // darf nie still als „lokal“ gelten.
  const roheUrl = projekt === "lokal" ? werte["--url"] : (werte["--url"] ?? env.ICR_SUPABASE_URL);
  let url;
  if (roheUrl) {
    // Wie scripts/verschluesselung.mjs: Ein dauerhaft gesetztes ICR_SUPABASE_URL darf „test“ nicht umlenken.
    if (projekt === "test") return { fehler: "--url bzw. ICR_SUPABASE_URL gibt es nur mit --projekt prod oder lokal." };
    const n = normalisiereUrl(roheUrl);
    if (n.fehler) return { fehler: n.fehler };
    if (projekt === "lokal" && !LOOPBACK.has(n.host)) {
      return { fehler: "--projekt lokal nur mit einer Adresse auf diesem Rechner (localhost, 127.0.0.1)." };
    }
    if (projekt === "lokal" && new URL(n.origin).port === PROD_TUNNEL_PORT) {
      return { fehler: `Port ${PROD_TUNNEL_PORT} ist der Tunnel zur Produktion – dafür --projekt prod verwenden.` };
    }
    url = n.origin;
  } else if (projekt === "lokal") {
    return { fehler: "--projekt lokal braucht --url, z. B. --url http://127.0.0.1:56321" };
  } else {
    url = `https://${PROJEKTE[projekt]}.supabase.co`;
  }

  const vorstand = werte["--vorstand"];
  if (vorstand !== undefined && befehl !== "reparieren") return { fehler: "--vorstand gibt es nur bei „reparieren“." };
  if (befehl === "reparieren" && !probelauf && vorstand === undefined) {
    return { fehler: "„reparieren“ braucht --vorstand <Profil-ID> (für das Korrekturprotokoll)." };
  }
  if (vorstand !== undefined && !UUID.test(vorstand)) return { fehler: "--vorstand muss eine Profil-ID (UUID) sein." };

  const liste = werte["--liste"];
  if (liste !== undefined) {
    if (befehl === "reparieren" && !probelauf) return { fehler: "--liste gibt es nur bei „pruefen“ und „reparieren --probelauf“." };
    if (!repoWurzel || !listePfadErlaubt(liste, repoWurzel)) {
      return { fehler: "--liste muss außerhalb des Repos liegen (das Repo ist öffentlich)." };
    }
    if (existsSync(liste)) return { fehler: "--liste: Die Datei gibt es schon – nichts wird überschrieben." };
  }

  return {
    befehl,
    probelauf,
    projekt,
    ref: PROJEKTE[projekt],
    url,
    ziel: roheUrl ? url : PROJEKTE[projekt],
    vorstand: vorstand?.toLowerCase(),
    liste: liste === undefined ? undefined : path.resolve(liste),
  };
}

// ---------------------------------------------------------------------------------------------------
// Schreiben und Fehler
// ---------------------------------------------------------------------------------------------------

/**
 * Service-Role-Client, dessen `save_member_secrets` nur mit der erwarteten Version durchgeht. Hintergrund:
 * saveMemberSecrets wiederholt bei einem Versionskonflikt einmal mit frisch gelesenen Daten. Das Skript soll
 * bei einem Konflikt das Profil aber überspringen (nicht wiederholen) – also lehnt dieser Client jeden
 * Versuch mit einer anderen Version als der geprüften als Konflikt ab (saveMemberSecrets wirft dann
 * MemberSecretsConflictError).
 */
export function mitVersionsSperre(admin, erwarteteVersion) {
  return new Proxy(admin, {
    get(ziel, name) {
      if (name === "rpc") {
        return (fn, args, optionen) => {
          if (fn === "save_member_secrets" && (args?.p_expected_version ?? null) !== erwarteteVersion) {
            return Promise.resolve({ data: null, error: { message: "member_secrets_conflict", code: "P0001" } });
          }
          return ziel.rpc(fn, args, optionen);
        };
      }
      const wert = Reflect.get(ziel, name, ziel);
      return typeof wert === "function" ? wert.bind(ziel) : wert;
    },
  });
}

/** Fehler ohne Daten: nur Fehlerklasse und Code-Stellen des Stacktraces, nie die Meldung. */
export function fehlerOhneDaten(err) {
  const name = err instanceof Error && /^[A-Za-z]+$/.test(err.name) ? err.name : "Fehler";
  const stellen =
    err instanceof Error && typeof err.stack === "string"
      ? err.stack
          .split("\n")
          .map((z) => z.trim())
          .filter((z) => z.startsWith("at "))
          .map((z) => z.replace(/^at (?:async )?(?:[\w.$<>]+ )?\(?/, "at ").replace(/\)$/, ""))
          .filter((z) => /^at (file|node):[^\s'"]*:\d+:\d+$/.test(z))
          .slice(0, 8)
      : [];
  return [name, ...stellen.map((s) => `  ${s}`)].join("\n");
}

// ---------------------------------------------------------------------------------------------------
// Laden, Sicherungen, Schreibschleife (Review P1–P3, P5)
// ---------------------------------------------------------------------------------------------------

/** Seitengröße beim Laden (unter dem PostgREST-Limit max_rows = 1000). */
export const SEITE = 500;

/**
 * Alle Zeilen seitenweise laden (Review P5): feste Seiten per `range`, die Gesamtzahl kommt aus der ersten
 * Antwort; es wird nie eine Seite hinter dem Ende abgefragt (PostgREST antwortet dort ggf. mit 416).
 * Abbruch, wenn die geladene Zahl nicht zur Gesamtzahl passt.
 */
export async function ladeAlle(abfrage, label, seite = SEITE) {
  const zeilen = [];
  let gesamt = null;
  for (let von = 0; ; von += seite) {
    const { data, error, count } = await abfrage(von, von + seite - 1);
    if (error) throw new Error(`${label} nicht lesbar`);
    if (gesamt === null) gesamt = count;
    if (typeof gesamt !== "number") throw new Error(`${label}: Gesamtzahl fehlt`);
    zeilen.push(...(data ?? []));
    if (zeilen.length >= gesamt || !data || data.length < seite) break;
  }
  if (zeilen.length !== gesamt) throw new Error(`${label} unvollständig geladen`);
  return zeilen;
}

/** Höchstzahl an Profilen und Pflicht-Domain eines Testziels (wie seed.sql / Vorschau-Testdaten). */
export const TESTZIEL = Object.freeze({ maxProfile: 200, domain: "@test.icr.local" });

/**
 * Sicherung für `--projekt lokal` (Review P1): Abbruch, wenn die Ziel-DB mehr als 200 Profile hat oder ein
 * Login-Konto nicht auf @test.icr.local endet. Liefert null oder eine Meldung (ohne Adressen).
 */
export async function pruefeTestziel(admin) {
  const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true });
  if (error || typeof count !== "number") return "Ziel nicht prüfbar (Profile nicht zählbar).";
  if (count > TESTZIEL.maxProfile) return `Ziel hat mehr als ${TESTZIEL.maxProfile} Profile – keine Testdatenbank.`;
  for (let seite = 1; seite <= 50; seite++) {
    const { data, error: e } = await admin.auth.admin.listUsers({ page: seite, perPage: TESTZIEL.maxProfile });
    if (e || !data) return "Ziel nicht prüfbar (Konten nicht lesbar).";
    const fremd = data.users.filter((u) => typeof u.email !== "string" || !u.email.toLowerCase().endsWith(TESTZIEL.domain));
    if (fremd.length) return `Ziel hat ${fremd.length} Konten außerhalb von ${TESTZIEL.domain} – keine Testdatenbank.`;
    if (data.users.length < TESTZIEL.maxProfile) return null;
  }
  return "Ziel hat zu viele Konten – keine Testdatenbank.";
}

/** Bestätigungswort mit Ziel und Zahl der zu ändernden Profile (Review P1). */
export function bestaetigungswort(ziel, anzahl) {
  return `REPARIEREN ${ziel} ${anzahl}`;
}

/**
 * IBAN-Stand vor dem Speichern (Review P3): saveMemberSecrets schreibt die IBAN bei jedem Speichern neu und
 * meldet eine IBAN-Änderung, wenn der Fingerabdruck nicht passt. Das Skript speichert nur, wenn die
 * gespeicherte IBAN schon normalisiert ist und ihr Fingerabdruck passt – so entsteht nie eine Meldung.
 *   ibanGeaendert(hash, iban) = ibanChanged(keyring, hash, iban); wirft bei beschädigtem Fingerabdruck.
 */
export function ibanStandStimmt(iban, ibanHash, ibanGeaendert) {
  if (iban === null || iban === undefined || iban === "") return true;
  if (typeof iban !== "string" || normalizeIban(iban) !== iban) return false;
  try {
    return ibanGeaendert(ibanHash, iban) === false;
  } catch {
    return false;
  }
}

/**
 * Strg+C während des Schreibens (Review P2): setzt nur ein Flag, die Schleife endet nach dem laufenden
 * Profil. Ein zweites Strg+C beendet sofort (`sofort`). `aufheben()` entfernt den Handler.
 */
export function abbruchBeiSignal(prozess = process, sofort = () => process.exit(130)) {
  const zustand = { angefordert: false };
  const handler = () => {
    if (zustand.angefordert) sofort();
    zustand.angefordert = true;
  };
  prozess.on("SIGINT", handler);
  zustand.aufheben = () => prozess.off("SIGINT", handler);
  return zustand;
}

/** Profile nacheinander bearbeiten, bis fertig oder ein Abbruch angefordert ist. */
export async function schreibeAlle(eintraege, schritt, abbruch, fortschritt = () => {}) {
  let bearbeitet = 0;
  for (const eintrag of eintraege) {
    if (abbruch.angefordert) break;
    await schritt(eintrag);
    bearbeitet++;
    fortschritt(bearbeitet);
  }
  return { bearbeitet, abgebrochen: bearbeitet < eintraege.length };
}
