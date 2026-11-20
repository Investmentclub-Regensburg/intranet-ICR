"use client";

/**
 * Seite „Daten prüfen“ (/daten-bestaetigen): Abfrage „Stimmen deine Daten noch?“ als eigene Seite ohne Seitenleiste
 * (Design-Runde 19.11.2026, verbindliche Skizze DatenPruefen.dc.html; ersetzt das Fenster aus PR 4).
 *
 * Eine Karte mit direkten Eingabefeldern, vorausgefüllt. Markiert ist, was der Server bemängelt: zu Beginn die
 * Bewertung des Bestands, danach nach jedem geänderten Feld eine Prüfung auf dem Server (pruefeMemberDataCheck,
 * dieselben Regeln wie beim Speichern, ohne zu speichern). Ein Knopf: „Stimmt alles, bestätigen“, solange nichts
 * geändert und nichts markiert ist (confirmMemberData), sonst „Speichern“ (saveMemberDataCheck, nur geänderte
 * Felder). Danach Danke-Ansicht mit Haken und füllender Leiste, dann zurück zum Rückkehrziel der Sperre.
 * Gültig ist nur, was der Server sagt (die Actions lesen frisch und prüfen neu, Versionssperre wie bisher).
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { IcrLogo } from "@/components/brand/IcrLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeldFehler, FeldHinweis, HandyEingabe, IbanEingabe, LandAuswahl } from "@/components/member/MemberInputs";
import {
  anschriftOptional,
  dankeText,
  dankeTitel,
  datenTitel,
  geaenderteFelder,
  gruenNachPruefung,
  knopfText,
  markierungenNachPruefung,
  meldungsOrt,
  offeneAngaben,
  ohneFeld,
  zaehlerText,
  zuSendendeWerte,
  type DatenWerte,
  type Markierungen,
} from "@/components/member/daten-pruefen";
import { ibanInViererbloecken } from "@/lib/member-rules-client";
import { plzInputMode } from "@/lib/member-inputs";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { DatenCheckFormular } from "@/lib/member-data-check";
import {
  confirmMemberData,
  postponeMemberDataCheck,
  pruefeMemberDataCheck,
  saveMemberDataCheck,
} from "@/app/(intranet)/profile/data-check-actions";
import { logoutAction } from "@/app/login/actions";

/** Was die Seite vom Server bekommt (nur das Nötige; Alumni ohne IBAN). */
export type DatenPruefenAnsicht = {
  gueltig: boolean;
  spaeterErlaubt: boolean;
  formular: DatenCheckFormular;
  formularFehler: Markierungen;
  /** Nicht blockierender Hinweis an der Handynummer (z. B. ergänzte Vorwahl). */
  handyHinweis?: string;
};

const MAENGEL_MELDUNG = "Bitte korrigiere zuerst die markierten Angaben.";
const FEHLER_MELDUNG = "Das hat nicht geklappt. Bitte versuch es noch einmal.";

/** Gemeinsame Optik der Eingabefelder (Skizze: 44 px hoch, 15 px Schrift, rot bzw. grün umrandet). */
const FELD =
  "[&_input]:h-11 [&_input]:rounded-[0.625rem] [&_input]:px-3.5 [&_input]:text-[0.9375rem] [&_select]:h-11 [&_select]:rounded-[0.625rem] [&_select]:px-3 [&_select]:text-[0.9375rem] [&_input[aria-invalid=true]]:bg-destructive/[0.03] [&_input[aria-invalid=true]]:ring-[3px] [&_input[aria-invalid=true]]:ring-destructive/10";
const GRUEN = "[&_input]:border-success";

/** Für useSyncExternalStore: nichts zu abonnieren (Server false, Browser nach der Hydration true). */
const keinAbo = () => () => {};

function startWerte(f: DatenCheckFormular): DatenWerte {
  return {
    vorname: f.vorname,
    nachname: f.nachname,
    geburtsdatum: f.geburtsdatum,
    strasse: f.strasse,
    hausnummer: f.hausnummer,
    plz: f.plz,
    ort: f.ort,
    land: f.land,
    handyLand: f.handyLand,
    handynummer: f.handyNummer,
    iban: ibanInViererbloecken(f.iban),
  };
}

export function DatenPruefenSeite({
  ansicht,
  email,
  weiter,
}: {
  ansicht: DatenPruefenAnsicht;
  /** Login-Adresse (gesperrt, nur Anzeige). */
  email: string;
  /** Rückkehrziel (vom Server geprüft). */
  weiter: string;
}) {
  const router = useRouter();
  const id = useId();
  const f = ansicht.formular;
  const [start] = useState(() => startWerte(f));
  const [anfang] = useState<Markierungen>(() => ({ ...ansicht.formularFehler }));
  const [werte, setWerte] = useState<DatenWerte>(start);
  const [markierungen, setMarkierungen] = useState<Markierungen>(anfang);
  const [gruen, setGruen] = useState<string[]>([]);
  const [meldung, setMeldung] = useState("");
  const [fertig, setFertig] = useState<{ gespeichert: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [aktion, setAktion] = useState<"senden" | "spaeter" | null>(null);
  // Erst nach der Hydration absenden (vorher ginge ein Klick als normales Formular durch).
  const bereit = useSyncExternalStore(keinAbo, () => true, () => false);

  const formular = useRef<HTMLFormElement>(null);
  const werteRef = useRef(werte);
  useEffect(() => {
    werteRef.current = werte;
  }, [werte]);

  // Fokus aufs erste markierte Feld nach einem Fehler beim Absenden (nach dem Rendern, auch in Firefox).
  const [fokusTakt, setFokusTakt] = useState(0);
  useEffect(() => {
    if (fokusTakt === 0) return;
    formular.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fokusTakt]);

  // Prüfung während der Eingabe: nur das letzte Ergebnis zählt, und nur, wenn die Werte noch dieselben sind.
  const pruefTakt = useRef(0);
  const zuletztGeprueft = useRef("[]");
  const pruefZeit = useRef(0);
  useEffect(() => () => window.clearTimeout(pruefZeit.current), []);

  const geaendert = geaenderteFelder(start, werte);
  const offen = offeneAngaben(markierungen);
  const mitLuecken = !ansicht.gueltig;

  function pruefeBald() {
    window.clearTimeout(pruefZeit.current);
    pruefZeit.current = window.setTimeout(pruefe, 120);
  }

  async function pruefe() {
    const senden = zuSendendeWerte(start, werteRef.current);
    const schluessel = JSON.stringify(senden);
    if (schluessel === zuletztGeprueft.current) return;
    zuletztGeprueft.current = schluessel;
    const takt = ++pruefTakt.current;
    if (senden.length === 0) {
      // Alles wieder wie am Anfang: die erste Bewertung gilt.
      setMarkierungen(anfang);
      setGruen([]);
      return;
    }
    const daten = new FormData();
    for (const [feld, wert] of senden) daten.set(feld, wert);
    try {
      const r = await pruefeMemberDataCheck(daten);
      if (!r.success || takt !== pruefTakt.current) return;
      if (JSON.stringify(zuSendendeWerte(start, werteRef.current)) !== schluessel) return;
      const jetztGeaendert = geaenderteFelder(start, werteRef.current);
      const neu = markierungenNachPruefung({ anfang, pruefung: r.fehler, vollstaendig: r.vollstaendig, geaendert: jetztGeaendert });
      setMarkierungen(neu);
      setGruen(mitLuecken ? gruenNachPruefung(anfang, jetztGeaendert, neu) : []);
    } catch {
      // Prüfen ist nur eine Hilfe; „Speichern“ prüft ohnehin neu.
    }
  }

  /** Wert setzen; das Feld gilt bis zur nächsten Prüfung als offen (nicht mehr rot, nicht grün). */
  function setze(neu: Partial<DatenWerte>, ...felder: string[]) {
    setWerte((alt) => ({ ...alt, ...neu }));
    setMarkierungen((alt) => ohneFeld(alt, ...felder));
    setGruen((alt) => (felder.some((feld) => alt.includes(feld)) ? alt.filter((feld) => !felder.includes(feld)) : alt));
    setMeldung("");
  }

  function weiterZumIntranet() {
    router.replace(weiter);
  }

  function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bereit || pending) return;
    window.clearTimeout(pruefZeit.current);
    pruefTakt.current++;
    const jetztGeaendert = geaenderteFelder(start, werte);
    if (jetztGeaendert.length === 0 && offeneAngaben(markierungen) > 0) {
      setMeldung(MAENGEL_MELDUNG);
      setFokusTakt((t) => t + 1);
      return;
    }
    setMeldung("");
    setAktion("senden");
    const stand = { version: f.version, vornameVorher: f.vorname, nachnameVorher: f.nachname };
    startTransition(async () => {
      try {
        let r;
        if (jetztGeaendert.length === 0) {
          r = await confirmMemberData(stand);
        } else {
          const daten = new FormData();
          daten.set("version", String(stand.version));
          daten.set("vornameVorher", stand.vornameVorher);
          daten.set("nachnameVorher", stand.nachnameVorher);
          for (const [feld, wert] of zuSendendeWerte(start, werte)) daten.set(feld, wert);
          r = await saveMemberDataCheck(daten);
        }
        if (r.success) {
          setFertig({ gespeichert: jetztGeaendert.length > 0 });
          return;
        }
        if (r.fehler && Object.keys(r.fehler).length > 0) {
          const neu = markierungenNachPruefung({
            anfang,
            pruefung: r.fehler,
            // Der Server sagt, ob er den ganzen Bestand bewertet hat (sonst nur Formularfehler).
            vollstaendig: r.vollstaendig === true,
            geaendert: jetztGeaendert,
          });
          setMarkierungen(neu);
          setGruen(mitLuecken ? gruenNachPruefung(anfang, jetztGeaendert, neu) : []);
          setFokusTakt((t) => t + 1);
        }
        setMeldung(r.error || FEHLER_MELDUNG);
      } catch {
        setMeldung(FEHLER_MELDUNG);
      }
    });
  }

  function spaeter() {
    if (pending) return;
    setMeldung("");
    setAktion("spaeter");
    startTransition(async () => {
      try {
        const r = await postponeMemberDataCheck();
        if (r.success) weiterZumIntranet();
        else setMeldung(r.error || FEHLER_MELDUNG);
      } catch {
        setMeldung(FEHLER_MELDUNG);
      }
    });
  }

  const feldId = (feld: string) => `${id}-${feld}`;
  // Gleiche Meldungen der Anschrift stehen nur einmal; das Feld verweist dann auf diese eine Meldung.
  const ort = meldungsOrt(markierungen);
  const eigeneMeldung = (feld: string) => (ort[feld] === feld ? markierungen[feld] : undefined);
  /** aria-Attribute eines Felds mit Markierung. */
  const ungueltig = (feld: string) =>
    markierungen[feld]
      ? { "aria-invalid": true as const, "aria-describedby": `${feldId(ort[feld] ?? feld)}-fehler` }
      : {};
  const gruenKlasse = (feld: string) => (gruen.includes(feld) ? GRUEN : undefined);
  const knopf = knopfText(geaendert.length > 0, offen);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-5">
        <span className="flex items-center gap-2.5">
          <IcrLogo className="h-8 w-auto shrink-0 text-brand" />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Intranet</span>
        </span>
        {!fertig && (
          // Formular mit Server-Action: Abmelden geht auch ohne JavaScript.
          <form action={logoutAction}>
            <button
              type="submit"
              className="min-h-10 rounded-lg px-1.5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none"
            >
              Abmelden
            </button>
          </form>
        )}
      </header>

      <main className="flex flex-1 justify-center px-4 pt-4 pb-16 sm:px-6">
        <div className="w-full max-w-[760px] min-w-0">
          {fertig ? (
            <DankeAnsicht vorname={f.vorname} gespeichert={fertig.gespeichert} onWeiter={weiterZumIntranet} />
          ) : (
            <div className="flex flex-col gap-7 duration-[450ms] ease-out animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
              <h1 className="mt-5 text-center text-[1.75rem] leading-[1.15] font-bold tracking-[-0.03em] text-balance sm:text-[2.25rem]">
                {datenTitel(f.vorname, ansicht.gueltig)}
              </h1>

              {/* Ohne JavaScript geht das Formular nicht: Hinweis, Abmelden steht oben. */}
              <noscript>
                <style>{"[data-nur-mit-js]{display:none!important}"}</style>
                <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm">
                  {ansicht.gueltig
                    ? "Bitte aktiviere JavaScript, um deine Daten zu bestätigen."
                    : "Bitte aktiviere JavaScript, um deine Daten zu aktualisieren."}
                </p>
              </noscript>

              <form
                ref={formular}
                data-nur-mit-js
                method="post"
                onSubmit={absenden}
                onBlur={pruefeBald}
                noValidate
                className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground"
              >
                <Abschnitt titel="Persönliches" erster />
                <Zeile label="Vorname" htmlFor={feldId("vorname")}>
                  <TextFeld
                    id={feldId("vorname")}
                    wert={werte.vorname}
                    onChange={(v) => setze({ vorname: v }, "vorname")}
                    autoComplete="given-name"
                    fehler={markierungen.vorname}
                    gruen={gruen.includes("vorname")}
                    {...ungueltig("vorname")}
                  />
                </Zeile>
                <Zeile label="Nachname" htmlFor={feldId("nachname")}>
                  <TextFeld
                    id={feldId("nachname")}
                    wert={werte.nachname}
                    onChange={(v) => setze({ nachname: v }, "nachname")}
                    autoComplete="family-name"
                    fehler={markierungen.nachname}
                    gruen={gruen.includes("nachname")}
                    {...ungueltig("nachname")}
                  />
                </Zeile>
                <Zeile label="Geburtsdatum" htmlFor={feldId("geburtsdatum")}>
                  <TextFeld
                    id={feldId("geburtsdatum")}
                    type="date"
                    wert={werte.geburtsdatum}
                    onChange={(v) => setze({ geburtsdatum: v }, "geburtsdatum")}
                    max={new Date().toISOString().slice(0, 10)}
                    autoComplete="bday"
                    fehler={markierungen.geburtsdatum}
                    gruen={gruen.includes("geburtsdatum")}
                    {...ungueltig("geburtsdatum")}
                  />
                </Zeile>

                <Abschnitt titel="Anschrift" optional={anschriftOptional(markierungen)} />
                <Zeile label="Straße und Nr." htmlFor={feldId("strasse")}>
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2.5">
                    <TextFeld
                      id={feldId("strasse")}
                      wert={werte.strasse}
                      onChange={(v) => setze({ strasse: v }, "strasse")}
                      autoComplete="address-line1"
                      gruen={gruen.includes("strasse")}
                      {...ungueltig("strasse")}
                    />
                    <TextFeld
                      id={feldId("hausnummer")}
                      aria-label="Hausnummer"
                      wert={werte.hausnummer}
                      onChange={(v) => setze({ hausnummer: v }, "hausnummer")}
                      gruen={gruen.includes("hausnummer")}
                      {...ungueltig("hausnummer")}
                    />
                  </div>
                  <Meldungen ids={[feldId("strasse"), feldId("hausnummer")]} texte={[eigeneMeldung("strasse"), eigeneMeldung("hausnummer")]} />
                </Zeile>
                <Zeile label="PLZ und Ort" htmlFor={feldId("plz")}>
                  <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2.5">
                    <TextFeld
                      id={feldId("plz")}
                      wert={werte.plz}
                      onChange={(v) => setze({ plz: v }, "plz")}
                      autoComplete="postal-code"
                      inputMode={plzInputMode(werte.land)}
                      gruen={gruen.includes("plz")}
                      {...ungueltig("plz")}
                    />
                    <TextFeld
                      id={feldId("ort")}
                      aria-label="Ort"
                      wert={werte.ort}
                      onChange={(v) => setze({ ort: v }, "ort")}
                      autoComplete="address-level2"
                      gruen={gruen.includes("ort")}
                      {...ungueltig("ort")}
                    />
                  </div>
                  <Meldungen ids={[feldId("plz"), feldId("ort")]} texte={[eigeneMeldung("plz"), eigeneMeldung("ort")]} />
                </Zeile>
                <Zeile label="Land" htmlFor={feldId("land")}>
                  <div className={FELD}>
                    <LandAuswahl
                      id={feldId("land")}
                      name=""
                      wert={werte.land}
                      onChange={(l) => {
                        setze({ land: l }, "land", "plz", "hausnummer", "ort");
                        pruefeBald();
                      }}
                      fehler={markierungen.land}
                      fehlerSymbol
                    />
                  </div>
                </Zeile>

                <Abschnitt titel="Kontakt" />
                <Zeile label="E-Mail" htmlFor={feldId("email")}>
                  <Input
                    id={feldId("email")}
                    value={email}
                    readOnly
                    aria-readonly
                    className="h-11 cursor-not-allowed rounded-[0.625rem] bg-muted px-3.5 text-[0.9375rem] text-muted-foreground"
                  />
                </Zeile>
                <Zeile
                  label={
                    <>
                      Handynummer <span className="font-normal text-muted-foreground">(optional)</span>
                    </>
                  }
                  htmlFor={feldId("handynummer")}
                >
                  <div className={cn(FELD, gruenKlasse("handynummer"))}>
                    <HandyEingabe
                      id={feldId("handynummer")}
                      landName=""
                      nummerName=""
                      wert={{ land: werte.handyLand, nummer: werte.handynummer }}
                      onChange={(w) => {
                        setze({ handyLand: w.land, handynummer: w.nummer }, "handynummer");
                        if (w.land !== werteRef.current.handyLand) pruefeBald();
                      }}
                      autoComplete="tel"
                      fehler={markierungen.handynummer}
                      fehlerSymbol
                    />
                    {!markierungen.handynummer && !geaendert.includes("handynummer") && (
                      <div className="mt-1.5">
                        <FeldHinweis>{ansicht.handyHinweis}</FeldHinweis>
                      </div>
                    )}
                  </div>
                </Zeile>

                {!f.alumni && (
                  <>
                    <Abschnitt titel="Bankverbindung" />
                    <Zeile label="IBAN" htmlFor={feldId("iban")}>
                      <div className={cn(FELD, gruenKlasse("iban"))}>
                        <IbanEingabe
                          id={feldId("iban")}
                          name=""
                          wert={werte.iban}
                          onChange={(w) => setze({ iban: w }, "iban")}
                          fehler={markierungen.iban}
                          fehlerSymbol
                        />
                      </div>
                    </Zeile>
                  </>
                )}
                <div className="h-[1.125rem]" />

                {meldung && (
                  <p role="alert" className="px-5 pb-4 text-sm text-destructive sm:px-7">
                    {meldung}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/40 px-5 py-5 sm:px-7">
                  <span className="flex items-center gap-2 text-sm" aria-live="polite">
                    <span className={cn("size-2 shrink-0 rounded-full", offen > 0 ? "bg-destructive" : "bg-success")} aria-hidden />
                    {zaehlerText(offen)}
                  </span>
                  <Button
                    type="submit"
                    disabled={!bereit || pending}
                    className="h-[3.125rem] w-full rounded-xl px-6 text-[0.9375rem] font-semibold sm:w-auto sm:min-w-[260px]"
                  >
                    {pending && aktion === "senden" ? "Wird gespeichert…" : knopf}
                  </Button>
                </div>
              </form>

              {ansicht.spaeterErlaubt && (
                <div data-nur-mit-js className="-mt-3 text-center">
                  <button
                    type="button"
                    onClick={spaeter}
                    disabled={!bereit || pending}
                    className="min-h-10 rounded-lg px-1.5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none disabled:opacity-50"
                  >
                    {pending && aktion === "spaeter" ? "Einen Moment…" : "Später"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Abschnittsüberschrift der Karte (Trennlinie davor, außer beim ersten). */
function Abschnitt({ titel, optional = false, erster = false }: { titel: string; optional?: boolean; erster?: boolean }) {
  return (
    <>
      {!erster && <div className="mt-3.5 h-px bg-border/70" />}
      <div className="flex items-center gap-2.5 px-5 pt-[1.125rem] pb-1.5 sm:px-7">
        <h2 className="text-[0.8125rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{titel}</h2>
        {optional && <span className="text-xs font-medium text-muted-foreground/80">optional</span>}
      </div>
    </>
  );
}

/** Beschriftung links, Feld rechts (am Handy untereinander). */
function Zeile({ label, htmlFor, children }: { label: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 px-5 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start sm:gap-5 sm:px-7">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground/80 sm:pt-[0.6875rem]">
        {label}
      </label>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

/** Einfaches Eingabefeld der Karte; `fehler` steht als Satz darunter (bei geteilten Zeilen über `Meldungen`). */
function TextFeld({
  id,
  wert,
  onChange,
  fehler,
  gruen,
  type = "text",
  ...rest
}: {
  id: string;
  wert: string;
  onChange: (wert: string) => void;
  fehler?: string;
  gruen?: boolean;
  type?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "id">) {
  return (
    <>
      <Input
        id={id}
        type={type}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 rounded-[0.625rem] px-3.5 text-[0.9375rem] aria-invalid:bg-destructive/[0.03] aria-invalid:ring-[3px] aria-invalid:ring-destructive/10",
          gruen && "border-success",
        )}
        {...rest}
      />
      {fehler !== undefined && (
        <FeldFehler id={`${id}-fehler`} symbol>
          {fehler}
        </FeldFehler>
      )}
    </>
  );
}

/** Meldungen einer geteilten Zeile (Straße + Nr., PLZ + Ort) über die ganze Breite. */
function Meldungen({ ids, texte }: { ids: string[]; texte: (string | undefined)[] }) {
  return (
    <>
      {ids.map((feldId, i) =>
        texte[i] ? (
          <FeldFehler key={feldId} id={`${feldId}-fehler`} symbol>
            {texte[i]}
          </FeldFehler>
        ) : null,
      )}
    </>
  );
}

/**
 * Danke-Ansicht: Haken zeichnet sich, Leiste füllt sich, danach geht es von selbst weiter (oder sofort per Knopf).
 * Bei „Bewegung reduzieren“ ohne Animation, Leiste gleich voll, kurz stehen lassen.
 */
function DankeAnsicht({
  vorname,
  gespeichert,
  onWeiter,
}: {
  vorname: string;
  gespeichert: boolean;
  onWeiter: () => void;
}) {
  const reduziert = useReducedMotionSafe();
  const textId = useId();
  const [laeuft, setLaeuft] = useState(false);
  const titel = useRef<HTMLHeadingElement>(null);
  const weiter = useRef(onWeiter);
  const gegangen = useRef(false);
  useEffect(() => {
    weiter.current = onWeiter;
  }, [onWeiter]);
  const geh = () => {
    if (gegangen.current) return;
    gegangen.current = true;
    weiter.current();
  };

  useEffect(() => {
    titel.current?.focus();
  }, []);

  useEffect(() => {
    if (reduziert) {
      const ende = window.setTimeout(geh, 2500);
      return () => window.clearTimeout(ende);
    }
    const bild = window.requestAnimationFrame(() => setLaeuft(true));
    // Sicherheitsnetz, falls das Ende der Leiste ausbleibt (z. B. Tab im Hintergrund).
    const notfall = window.setTimeout(geh, 6000);
    return () => {
      window.cancelAnimationFrame(bild);
      window.clearTimeout(notfall);
    };
  }, [reduziert]); // geh liest nur Refs

  return (
    <div
      className="flex min-h-[min(620px,70dvh)] flex-col items-center justify-center gap-[1.125rem] text-center duration-[450ms] ease-out animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <span className="flex size-[88px] items-center justify-center rounded-full bg-success-tint text-success duration-500 ease-out animate-in fade-in-0 zoom-in-50 motion-reduce:animate-none">
        <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path
            d="M20 6 9 17l-5-5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={laeuft || reduziert ? 0 : 1}
            style={reduziert ? undefined : { transition: "stroke-dashoffset 450ms ease-out 300ms" }}
          />
        </svg>
      </span>
      {/* Eine Ansage: Der Fokus springt auf die Überschrift, der Satz darunter ist ihre Beschreibung (kein role=status
          zusätzlich, sonst würde alles zweimal vorgelesen). */}
      <h1
        ref={titel}
        tabIndex={-1}
        aria-describedby={`${textId}`}
        className="mt-1.5 text-[2rem] font-bold tracking-[-0.03em] outline-none"
      >
        {dankeTitel(vorname)}
      </h1>
      <p id={textId} className="text-base text-muted-foreground">
        {dankeText(gespeichert)}
      </p>
      <span className="mt-2.5 h-1.5 w-[220px] max-w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className="block h-full rounded-full bg-primary"
          style={{
            width: laeuft || reduziert ? "100%" : "0%",
            transition: reduziert ? undefined : "width 2400ms linear 800ms",
          }}
          onTransitionEnd={(e) => {
            if (e.propertyName === "width" && laeuft) geh();
          }}
        />
      </span>
      <Button type="button" onClick={geh} className="mt-1.5 h-[3.125rem] rounded-xl px-6 text-[0.9375rem] font-semibold">
        Weiter zum Intranet
      </Button>
    </div>
  );
}
