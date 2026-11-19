"use client";

/**
 * Fenster „Stimmen deine Daten noch?“ (Paket „Mitgliederdaten“, PR 4). Sitzt im Intranet-Layout und erscheint,
 * wenn die Abfrage fällig ist (Server: lib/member-data-check.ts). Nicht wegklickbar: kein Schließen-X, Escape
 * und Klick daneben schließen nie. Bei Mängeln gibt es nur „Ändern“ (und Abmelden); sonst „Stimmt alles“,
 * „Ändern“ und, solange erlaubt, „Später“. „Ändern“ gleitet im selben Fenster zum Formular mit den Eingaben aus
 * dem Profil. Nach dem Speichern zeichnet sich ein Haken, die Leiste füllt sich, das Fenster schließt.
 * Gültig ist nur, was der Server sagt (die Actions prüfen neu).
 */
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, Pencil } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WizardNav, WizardStep, type WizardDirection } from "@/components/kit/Wizard";
import {
  FeldFehler,
  GespeichertHaken,
  HandyEingabe,
  IbanEingabe,
  LandAuswahl,
  type HandyWert,
} from "@/components/member/MemberInputs";
import { ibanInViererbloecken } from "@/lib/member-rules-client";
import { plzInputMode } from "@/lib/member-inputs";
import type { DatenCheckAnsicht, DatenCheckZeile } from "@/lib/member-data-check";
import { confirmMemberData, postponeMemberDataCheck, saveMemberDataCheck } from "@/app/(intranet)/profile/data-check-actions";
import { logoutAction } from "@/app/login/actions";

type Schritt = "uebersicht" | "aendern" | "fertig";

/**
 * Überschrift mit Vornamen (Hannes, 19.11.): gültig „Hallo Max, stimmen deine Daten noch?“, bei Mängeln
 * „Hallo Max, bitte aktualisiere deine Daten.“ Ohne Vornamen ohne Anrede.
 */
export function fensterTitel(vorname: string, gueltig: boolean): string {
  const name = vorname.trim();
  const frage = gueltig ? "stimmen deine Daten noch?" : "bitte aktualisiere deine Daten.";
  return name ? `Hallo ${name}, ${frage}` : frage.charAt(0).toUpperCase() + frage.slice(1);
}
type Fehler = Partial<Record<string, string>>;

/**
 * `children` = die Seite darunter (nur bei gültigen Daten; bei Mängeln steht das Fenster auf der eigenen Seite
 * /daten-bestaetigen auf leerem Grund). `weiter`: wohin es nach dem Haken geht (sonst Neuladen). Solange das
 * Fenster offen ist, ist sie `inert` + `aria-hidden` – schon im Server-HTML, also auch vor der Hydration. Das Fenster
 * wird ohne Portal gerendert und steht damit ebenfalls im Server-HTML: kein Aufblitzen der Seite, und ohne
 * JavaScript sieht man das Fenster mit dem Hinweis und „Abmelden“ statt einer bedienbaren Seite (Review A1/B1).
 * Das gilt bewusst auch bei gültigen Daten (Entscheidung G2): `inert` lässt sich per noscript nicht aufheben, und
 * `inert` erst nach der Hydration machte die Seite davor kurz bedienbar.
 */
export function DatenCheckFenster({
  ansicht,
  children,
  weiter,
}: {
  ansicht: DatenCheckAnsicht;
  children?: ReactNode;
  weiter?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [offen, setOffen] = useState(true);
  const [schritt, setSchritt] = useState<Schritt>("uebersicht");
  const [richtung, setRichtung] = useState<WizardDirection>("forward");
  const [fehler, setFehler] = useState<Fehler>(() => ({ ...ansicht.formularFehler }));
  const [meldung, setMeldung] = useState("");
  const [pending, startTransition] = useTransition();
  const [aktion, setAktion] = useState<"stimmt" | "spaeter" | null>(null);
  const f = ansicht.formular;
  const [land, setLand] = useState(f.land);
  const [handy, setHandy] = useState<HandyWert>({ land: f.handyLand, nummer: f.handyNummer });
  const [iban, setIban] = useState(() => ibanInViererbloecken(f.iban));
  const inhalt = useRef<HTMLDivElement>(null);
  // Fokus nach Schrittwechsel bzw. Serverfehler: Ziel merken, nach dem Rendern setzen (auch in Firefox).
  const fokusZiel = useRef<"fehler" | "schritt" | null>(null);
  const [fokusTakt, setFokusTakt] = useState(0);
  const fokussiere = (ziel: "fehler" | "schritt") => {
    fokusZiel.current = ziel;
    setFokusTakt((t) => t + 1);
  };

  useEffect(() => {
    const art = fokusZiel.current;
    if (!art) return;
    fokusZiel.current = null;
    const scope = inhalt.current?.querySelector<HTMLElement>(`[data-wizard-step="${schritt}"]`);
    const ziel =
      art === "fehler"
        ? scope?.querySelector<HTMLElement>('[aria-invalid="true"]')
        : scope?.querySelector<HTMLElement>("input:not([type=hidden]), select, button");
    ziel?.focus();
  }, [fokusTakt, schritt]);

  function gehe(nach: Schritt, dir: WizardDirection) {
    setMeldung("");
    setRichtung(dir);
    setSchritt(nach);
    // „Ändern“ bei Mängeln: Fokus aufs erste markierte Feld (Review B2).
    fokussiere(nach === "aendern" && Object.values(fehler).some(Boolean) ? "fehler" : "schritt");
  }

  function fertig() {
    setOffen(false);
    if (weiter) router.replace(weiter);
    else router.refresh();
  }

  function clear(...felder: string[]) {
    setFehler((alt) => {
      if (!felder.some((feld) => alt[feld])) return alt;
      const neu = { ...alt };
      for (const feld of felder) delete neu[feld];
      return neu;
    });
  }

  function stimmtAlles() {
    setMeldung("");
    setAktion("stimmt");
    startTransition(async () => {
      try {
        const r = await confirmMemberData({ version: f.version, vornameVorher: f.vorname, nachnameVorher: f.nachname });
        if (r.success) {
          setRichtung("forward");
          setSchritt("fertig");
        } else if (r.fehler && Object.keys(r.fehler).length > 0) {
          setFehler(r.fehler);
          setRichtung("forward");
          setSchritt("aendern");
          setMeldung(r.error);
          fokussiere("fehler");
        } else {
          setMeldung(r.error || "Das hat nicht geklappt.");
        }
      } catch {
        setMeldung("Das hat nicht geklappt. Bitte versuch es noch einmal.");
      }
    });
  }

  function spaeter() {
    setMeldung("");
    setAktion("spaeter");
    startTransition(async () => {
      try {
        const r = await postponeMemberDataCheck();
        if (r.success) fertig();
        else setMeldung(r.error || "Das hat nicht geklappt.");
      } catch {
        setMeldung("Das hat nicht geklappt. Bitte versuch es noch einmal.");
      }
    });
  }

  function abmelden() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  // Eigener Submit statt <form action>: React setzt Formulare nach einer Action sonst zurück.
  function speichern(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMeldung("");
    setFehler({});
    startTransition(async () => {
      try {
        const r = await saveMemberDataCheck(formData);
        if (r.success) {
          setRichtung("forward");
          setSchritt("fertig");
        } else if (r.fehler && Object.keys(r.fehler).length > 0) {
          setFehler(r.fehler);
          fokussiere("fehler");
        } else {
          setMeldung(r.error || "Speichern hat nicht geklappt.");
        }
      } catch {
        setMeldung("Speichern hat nicht geklappt. Bitte versuch es noch einmal.");
      }
    });
  }

  return (
    <>
      {children !== undefined && (
        <div inert={offen} aria-hidden={offen || undefined}>
          {children}
        </div>
      )}
    <DialogPrimitive.Root open={offen}>
      {offen && (
        // Ohne Einblenden: ab dem ersten Bild deckend, damit die Seite darunter nie kurz ohne Fenster zu sehen ist
        // (Gegenprüfung G1, Chromium malt vor der Hydration).
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-sm dark:bg-black/50" />
      )}
      <DialogPrimitive.Content
        aria-describedby={undefined}
        // Nicht wegklickbar: Escape und Klick daneben schließen nie (Schließen nur über „Später“ bzw. nach dem Haken).
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        // Einblenden nur ohne „Bewegung reduzieren“; per CSS-Medienabfrage, damit es schon vor der Hydration gilt
        // (useReducedMotionSafe liefert beim ersten Rendern false).
        className="bg-card text-card-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none! fixed top-[50%] left-[50%] z-50 grid max-h-[92dvh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-x-hidden overflow-y-auto rounded-2xl border p-5 shadow-card duration-200 sm:max-w-md sm:p-6"
      >
        <DialogTitle className="text-xl">{fensterTitel(f.vorname, ansicht.gueltig)}</DialogTitle>
        {/* Ohne JavaScript funktionieren die Knöpfe nicht: Hinweis und Abmelden (Server-Action als Formular). */}
        <noscript>
          {/* Knöpfe, die nur mit JavaScript gehen, ausblenden. */}
          <style>{"[data-nur-mit-js]{display:none!important}"}</style>
          {/* Auch bei gültigen Daten gesperrt (Entscheidung G2): `inert` lässt sich ohne JS nicht aufheben. */}
          <p className="mt-3 text-sm">
            {ansicht.gueltig
              ? "Bitte aktiviere JavaScript, um deine Daten zu bestätigen."
              : "Bitte aktiviere JavaScript, um deine Daten zu aktualisieren."}
          </p>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="text-sm font-medium text-primary underline underline-offset-4">
              Abmelden
            </button>
          </form>
        </noscript>
        <div ref={inhalt} className="mt-4 min-w-0">
          <WizardStep stepKey="uebersicht" active={schritt === "uebersicht"} direction={richtung} className="space-y-4">
            <dl className="divide-y divide-border rounded-xl border border-border">
              {ansicht.zeilen.map((z) => (
                <ZeilenAnzeige key={z.key} zeile={z} />
              ))}
            </dl>
            <Meldung>{meldung}</Meldung>
            <div data-nur-mit-js className="flex flex-col gap-2 sm:flex-row-reverse sm:flex-wrap">
              {ansicht.gueltig ? (
                <>
                  <Button type="button" onClick={stimmtAlles} disabled={pending} className="sm:flex-1">
                    <Check aria-hidden />
                    {pending && aktion === "stimmt" ? "Wird gespeichert…" : "Stimmt alles"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => gehe("aendern", "forward")} disabled={pending} className="sm:flex-1">
                    <Pencil aria-hidden />
                    Ändern
                  </Button>
                  {ansicht.spaeterErlaubt && (
                    <Button type="button" variant="ghost" onClick={spaeter} disabled={pending} className="sm:basis-full">
                      Später
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button type="button" onClick={() => gehe("aendern", "forward")} disabled={pending} className="sm:flex-1">
                    <Pencil aria-hidden />
                    Aktualisieren
                  </Button>
                  <Button type="button" variant="ghost" onClick={abmelden} disabled={pending} className="sm:flex-1">
                    <LogOut aria-hidden />
                    Abmelden
                  </Button>
                </>
              )}
            </div>
          </WizardStep>

          <WizardStep stepKey="aendern" active={schritt === "aendern"} direction={richtung}>
            <form onSubmit={speichern} noValidate className="space-y-4">
              <input type="hidden" name="version" value={f.version} />
              <input type="hidden" name="vornameVorher" value={f.vorname} />
              <input type="hidden" name="nachnameVorher" value={f.nachname} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Feld id={`${id}-vorname`} label="Vorname" fehler={fehler.vorname}>
                  <Input id={`${id}-vorname`} name="vorname" defaultValue={f.vorname} autoComplete="given-name" {...ungueltig(`${id}-vorname`, fehler.vorname)} onInput={() => clear("vorname")} />
                </Feld>
                <Feld id={`${id}-nachname`} label="Nachname" fehler={fehler.nachname}>
                  <Input id={`${id}-nachname`} name="nachname" defaultValue={f.nachname} autoComplete="family-name" {...ungueltig(`${id}-nachname`, fehler.nachname)} onInput={() => clear("nachname")} />
                </Feld>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
                <Feld id={`${id}-strasse`} label="Straße (optional)" fehler={fehler.strasse}>
                  <Input id={`${id}-strasse`} name="strasse" defaultValue={f.strasse} autoComplete="address-line1" {...ungueltig(`${id}-strasse`, fehler.strasse)} onInput={() => clear("strasse")} />
                </Feld>
                <Feld id={`${id}-hausnummer`} label="Hausnr. (optional)" fehler={fehler.hausnummer} fehlerUnterDerZeile>
                  <Input id={`${id}-hausnummer`} name="hausnummer" defaultValue={f.hausnummer} {...ungueltig(`${id}-hausnummer`, fehler.hausnummer)} onInput={() => clear("hausnummer")} />
                </Feld>
                <ZeilenFehler id={`${id}-hausnummer`} fehler={fehler.hausnummer} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-land`} className="text-xs font-medium text-muted-foreground">
                  Land
                </Label>
                <LandAuswahl
                  id={`${id}-land`}
                  wert={land}
                  onChange={(l) => {
                    setLand(l);
                    clear("land", "plz", "hausnummer", "ort");
                  }}
                  fehler={fehler.land}
                />
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                <Feld id={`${id}-plz`} label="PLZ (optional)" fehler={fehler.plz} fehlerUnterDerZeile>
                  <Input id={`${id}-plz`} name="plz" defaultValue={f.plz} autoComplete="postal-code" inputMode={plzInputMode(land)} {...ungueltig(`${id}-plz`, fehler.plz)} onInput={() => clear("plz")} />
                </Feld>
                <Feld id={`${id}-ort`} label="Ort (optional)" fehler={fehler.ort}>
                  <Input id={`${id}-ort`} name="ort" defaultValue={f.ort} autoComplete="address-level2" {...ungueltig(`${id}-ort`, fehler.ort)} onInput={() => clear("ort")} />
                </Feld>
                <ZeilenFehler id={`${id}-plz`} fehler={fehler.plz} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-handy`} className="text-xs font-medium text-muted-foreground">
                  Handynummer (optional)
                </Label>
                <HandyEingabe
                  id={`${id}-handy`}
                  wert={handy}
                  onChange={(w) => {
                    setHandy(w);
                    clear("handynummer");
                  }}
                  autoComplete="tel"
                  fehler={fehler.handynummer}
                />
              </div>
              <Feld id={`${id}-geburtsdatum`} label="Geburtsdatum" fehler={fehler.geburtsdatum}>
                <Input
                  id={`${id}-geburtsdatum`}
                  name="geburtsdatum"
                  type="date"
                  defaultValue={f.geburtsdatum}
                  max={new Date().toISOString().slice(0, 10)}
                  autoComplete="bday"
                  {...ungueltig(`${id}-geburtsdatum`, fehler.geburtsdatum)}
                  onInput={() => clear("geburtsdatum")}
                />
              </Feld>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-iban`} className="text-xs font-medium text-muted-foreground">
                  IBAN
                </Label>
                <IbanEingabe
                  id={`${id}-iban`}
                  wert={iban}
                  onChange={(w) => {
                    setIban(w);
                    clear("iban");
                  }}
                  placeholder={f.alumni ? "Als Alumni nicht nötig" : undefined}
                  fehler={fehler.iban}
                />
              </div>
              <Meldung>{meldung}</Meldung>
              <WizardNav onBack={pending ? undefined : () => gehe("uebersicht", "back")}>
                <Button type="submit" disabled={pending}>
                  {pending ? "Speichern…" : "Speichern"}
                </Button>
              </WizardNav>
            </form>
          </WizardStep>

          <WizardStep stepKey="fertig" active={schritt === "fertig"} direction={richtung}>
            {schritt === "fertig" && <GespeichertHaken text="Danke, deine Daten sind bestätigt" onFertig={fertig} />}
          </WizardStep>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
    </>
  );
}

/** Eine Zeile der Übersicht: Bezeichnung, Wert, bei Mangel Punkt + eine Zeile, sonst ggf. Hinweis. */
function ZeilenAnzeige({ zeile }: { zeile: DatenCheckZeile }) {
  return (
    <div className="min-w-0 px-3.5 py-2.5">
      <dt className="text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{zeile.label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm font-medium break-words">
        {zeile.wert.length > 0 ? (
          zeile.wert.map((w, i) => (
            <span key={i} className="block">
              {w}
            </span>
          ))
        ) : (
          // Leer ohne Mangel = freiwilliges Feld ohne Angabe (Handy, Anschrift).
          <span className="text-muted-foreground">{zeile.fehler ? "Fehlt" : "Keine Angabe"}</span>
        )}
        {zeile.fehler ? (
          <span className="mt-1 flex items-start gap-1.5 text-xs font-normal text-destructive">
            <span className="mt-[0.3rem] size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
            <span className="min-w-0">{zeile.fehler}</span>
          </span>
        ) : (
          zeile.hinweis && <span className="mt-1 block text-xs font-normal text-muted-foreground">{zeile.hinweis}</span>
        )}
      </dd>
    </div>
  );
}

function Meldung({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

function Feld({
  id,
  label,
  fehler,
  fehlerUnterDerZeile = false,
  children,
}: {
  id: string;
  label: string;
  fehler?: string;
  /** Schmale Spalte (PLZ, Hausnr.): Meldung steht als ZeilenFehler unter der ganzen Zeile (Rundgang R2). */
  fehlerUnterDerZeile?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {!fehlerUnterDerZeile && <FeldFehler id={`${id}-fehler`}>{fehler}</FeldFehler>}
    </div>
  );
}

/** Meldung eines schmalen Felds über die volle Breite der Zeile (im Raster, beide Spalten). */
function ZeilenFehler({ id, fehler }: { id: string; fehler?: string }) {
  if (!fehler) return null;
  return (
    <div className="col-span-2 -mt-1.5">
      <FeldFehler id={`${id}-fehler`}>{fehler}</FeldFehler>
    </div>
  );
}

function ungueltig(id: string, fehler?: string) {
  return fehler ? { "aria-invalid": true as const, "aria-describedby": `${id}-fehler` } : {};
}
