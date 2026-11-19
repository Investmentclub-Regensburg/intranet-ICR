"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FeldFehler,
  FeldHinweis,
  GespeichertHaken,
  HandyEingabe,
  IbanEingabe,
  LandAuswahl,
  SELECT_CLASS,
  type HandyWert,
} from "@/components/member/MemberInputs";
import { plzInputMode } from "@/lib/member-inputs";
import { cn } from "@/lib/utils";
import {
  correctMemberData,
  getMemberCorrectionData,
  updateMemberRole,
  type AdminMemberRow,
  type MemberCorrectionData,
  type MemberCorrectionInput,
} from "@/app/(intranet)/admin/members/actions";
import {
  angezeigteRolle,
  datenGeaendert,
  mitgliedschaftAufruf,
  mitgliedschaftGesperrt,
  mitgliedschaftNachAufruf,
  mitgliedschaftVon,
  rolleGesperrt,
  rolleVon,
  type Mitgliedschaft,
} from "./member-list";

type Fehler = Partial<Record<string, string>>;

/** Klartextfelder des Korrekturteils (wie KORREKTUR_FELDER in lib/member-forms.ts, das nur auf dem Server läuft). */
const DATEN_FELDER = [
  "vorname",
  "nachname",
  "strasse",
  "hausnummer",
  "plz",
  "ort",
  "land",
  "handyLand",
  "handynummer",
  "geburtsdatum",
  "bic",
] as const satisfies readonly (keyof MemberCorrectionData)[];

const ROLLEN_OPTIONEN = [
  ["member", "Mitglied"],
  ["admin", "Admin"],
  ["board", "Vorstand"],
  ["alumni", "Alumni"],
] as const;

const FELD_HOEHE = "h-10";

/**
 * Bearbeiten-Fenster des Vorstands (Design-Runde 19.11.2026): oben die Mitgliedschaft (Rolle, Status), darunter
 * die Korrektur der verschlüsselten Daten (Adresse mit Land, Handy mit Länderauswahl, Geburtsdatum,
 * Bankverbindung). Beim Speichern geht nur, was sich geändert hat: Rolle/Status über updateMemberRole
 * (Zuordnung in member-list.ts), Daten über correctMemberData. Ändert sich nur die Rolle, laufen die
 * verschlüsselten Felder nicht mit, und umgekehrt. Die Rechte prüft der Server (nur Vorstand).
 *
 * Die Daten werden beim Öffnen geladen; die IBAN erscheint nur gekürzt und wird durch Neueingabe ersetzt
 * (leer = unverändert). Der Server prüft nur geänderte Felder (alte Fehler in anderen Feldern blockieren nicht)
 * und meldet Fehler je Feld. Sind die Daten nicht lesbar, bleibt die Mitgliedschaft trotzdem änderbar.
 *
 * Wird je Öffnung neu eingehängt (key in der Liste); `member` ist der Stand beim Öffnen.
 */
export function MemberCorrectionDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Pick<AdminMemberRow, "id" | "name" | "email" | "rolle" | "status">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<MemberCorrectionData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fehler, setFehler] = useState<Fehler>({});
  const [datenFehler, setDatenFehler] = useState("");
  const [msFehler, setMsFehler] = useState("");
  const [basisMs, setBasisMs] = useState<Mitgliedschaft>(() => mitgliedschaftVon(member));
  const [auswahlMs, setAuswahlMs] = useState<Mitgliedschaft>(() => mitgliedschaftVon(member));
  const [land, setLand] = useState("DE");
  const [handy, setHandy] = useState<HandyWert>({ land: "DE", nummer: "" });
  const [iban, setIban] = useState("");
  // Antwort eines inzwischen geschlossenen Fensters verwerfen.
  const aktiv = useRef(true);

  function uebernehme(d: MemberCorrectionData) {
    setData(d);
    setLand(d.land);
    setHandy({ land: d.handyLand, nummer: d.handynummer });
    setIban("");
  }

  function ladeDaten() {
    return getMemberCorrectionData(member.id).catch(() => ({ error: "Daten konnten nicht geladen werden." }));
  }

  async function lade(): Promise<void> {
    const result = await ladeDaten();
    if (!aktiv.current) return;
    if ("error" in result) setLoadError(result.error);
    else uebernehme(result.data);
  }

  useEffect(() => {
    aktiv.current = true;
    ladeDaten().then((result) => {
      if (!aktiv.current) return;
      if ("error" in result) setLoadError(result.error);
      else uebernehme(result.data);
    });
    return () => {
      aktiv.current = false;
    };
    // Nur beim Einhängen laden (je Öffnung neu eingehängt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function schliessen() {
    // Entschlüsselte Werte nicht im Speicher der Seite behalten.
    aktiv.current = false;
    setData(null);
    setHandy({ land: "DE", nummer: "" });
    setIban("");
    onOpenChange(false);
  }

  function clear(...felder: string[]) {
    setFehler((alt) => {
      if (!felder.some((f) => alt[f])) return alt;
      const neu = { ...alt };
      for (const f of felder) delete neu[f];
      return neu;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");

    const aufruf = mitgliedschaftAufruf(basisMs, auswahlMs);
    let eingabe: MemberCorrectionInput | null = null;
    if (data) {
      eingabe = {
        vorname: value("vorname"),
        nachname: value("nachname"),
        strasse: value("strasse"),
        hausnummer: value("hausnummer"),
        plz: value("plz"),
        ort: value("ort"),
        land,
        handyLand: handy.land,
        handynummer: handy.nummer,
        geburtsdatum: value("geburtsdatum"),
        bic: value("bic"),
        iban,
      };
      if (!datenGeaendert(eingabe, data, DATEN_FELDER)) eingabe = null;
    }

    if (!aufruf && !eingabe) {
      toast.success("Keine Änderungen.");
      schliessen();
      return;
    }

    setSaving(true);
    setFehler({});
    setDatenFehler("");
    setMsFehler("");
    let ok = true;
    let geaendert = false;
    let datenGespeichert = false;
    try {
      if (eingabe && data) {
        try {
          const result = await correctMemberData(member.id, eingabe, data);
          if (result.fehler && Object.keys(result.fehler).length > 0) {
            setFehler(result.fehler);
            ok = false;
          } else if (result.error) {
            setDatenFehler(result.error);
            ok = false;
          } else if (!result.unchanged) {
            geaendert = true;
            datenGespeichert = true;
          }
        } catch {
          setDatenFehler("Korrektur konnte nicht gespeichert werden.");
          ok = false;
        }
      }

      if (aufruf) {
        try {
          const result = await updateMemberRole(member.id, aufruf);
          if (result.error) {
            setMsFehler(result.error);
            ok = false;
          } else {
            // Neue Ausgangswerte: erneutes Speichern sendet die Mitgliedschaft nicht doppelt.
            const neu = mitgliedschaftNachAufruf(aufruf);
            setBasisMs(neu);
            setAuswahlMs(neu);
            geaendert = true;
          }
        } catch {
          setMsFehler("Änderung konnte nicht gespeichert werden.");
          ok = false;
        }
      }

      if (!aktiv.current) return;
      if (ok) {
        if (geaendert) setSaved(true);
        else {
          toast.success("Keine Änderungen.");
          schliessen();
        }
      } else if (datenGespeichert) {
        // Daten gespeichert, Mitgliedschaft nicht: Ausgangswerte neu laden, sonst meldet der nächste
        // Versuch „inzwischen geändert“.
        await lade();
      }
    } finally {
      setSaving(false);
    }
  }

  const invalid = (id: string, f?: string) =>
    f ? { "aria-invalid": true as const, "aria-describedby": `${id}-fehler` } : {};

  const gesperrt = mitgliedschaftGesperrt(basisMs);
  const rolleZu = rolleGesperrt(basisMs, auswahlMs);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else if (!saving) schliessen();
      }}
    >
      <DialogContent className="block max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[18px] p-0 sm:max-w-[600px]">
        {saved ? (
          <div className="px-6 py-12">
            <DialogTitle className="sr-only">{member.name}</DialogTitle>
            <DialogDescription className="sr-only">Gespeichert</DialogDescription>
            <GespeichertHaken
              onFertig={() => {
                schliessen();
                router.refresh();
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 pt-[22px] pr-5 pb-1 pl-6">
              <div className="min-w-0">
                <DialogTitle className="text-xl [overflow-wrap:anywhere]">{data?.name ?? member.name}</DialogTitle>
                <DialogDescription className="mt-1 text-[0.8125rem]">
                  Änderungen werden mit deinem Namen protokolliert (ohne Werte).
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon-lg" aria-label="Schließen" className="shrink-0 text-muted-foreground">
                  <X className="size-[18px]" aria-hidden />
                </Button>
              </DialogClose>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-6 px-6 pt-4 pb-2">
                <Abschnitt titel="Mitgliedschaft">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid min-w-0 gap-1.5">
                      <Label htmlFor="mc-rolle">Rolle</Label>
                      <select
                        id="mc-rolle"
                        value={angezeigteRolle(basisMs, auswahlMs)}
                        disabled={rolleZu || saving}
                        onChange={(e) => {
                          setAuswahlMs((alt) => ({ ...alt, rolle: rolleVon({ rolle: e.target.value }) }));
                          setMsFehler("");
                        }}
                        aria-describedby={msFehler ? "mc-ms-fehler" : undefined}
                        className={cn(SELECT_CLASS, FELD_HOEHE, "disabled:bg-muted disabled:text-muted-foreground")}
                      >
                        {ROLLEN_OPTIONEN.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid min-w-0 gap-1.5">
                      <Label htmlFor="mc-status">Status</Label>
                      <select
                        id="mc-status"
                        value={auswahlMs.status}
                        disabled={gesperrt || saving}
                        onChange={(e) => {
                          const status = e.target.value === "cancelled" ? "cancelled" : "active";
                          setAuswahlMs((alt) => ({ ...alt, status }));
                          setMsFehler("");
                        }}
                        aria-describedby={msFehler ? "mc-ms-fehler" : undefined}
                        className={cn(SELECT_CLASS, FELD_HOEHE, "disabled:bg-muted disabled:text-muted-foreground")}
                      >
                        <option value="active">Aktiv</option>
                        {basisMs.status === "applicant" && (
                          <option value="applicant" disabled>
                            Antrag offen
                          </option>
                        )}
                        <option value="cancelled">Ausgetreten</option>
                      </select>
                    </div>
                  </div>
                  <FeldFehler id="mc-ms-fehler">{msFehler}</FeldFehler>
                </Abschnitt>

                {loadError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {loadError}
                  </p>
                ) : !data ? (
                  <p className="text-sm text-muted-foreground">Wird geladen …</p>
                ) : (
                  // Neu eingehängt, wenn die Daten neu geladen wurden (defaultValue übernimmt sonst nichts).
                  <div key={data.version} className="flex flex-col gap-6 [&_input]:h-10 [&_select]:h-10">
                    <Abschnitt titel="Persönliche Daten">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field id="mc-vorname" label="Vorname" fehler={fehler.vorname}>
                          <Input id="mc-vorname" name="vorname" defaultValue={data.vorname} autoComplete="off" {...invalid("mc-vorname", fehler.vorname)} onInput={() => clear("vorname")} />
                        </Field>
                        <Field id="mc-nachname" label="Nachname" fehler={fehler.nachname}>
                          <Input id="mc-nachname" name="nachname" defaultValue={data.nachname} autoComplete="off" {...invalid("mc-nachname", fehler.nachname)} onInput={() => clear("nachname")} />
                        </Field>
                      </div>
                      <div className="grid min-w-0 gap-1.5">
                        <Label htmlFor="mc-email">E-Mail</Label>
                        <Input id="mc-email" value={member.email || "—"} readOnly className="bg-muted text-muted-foreground" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field id="mc-geburtsdatum" label="Geburtsdatum" fehler={fehler.geburtsdatum}>
                          <Input id="mc-geburtsdatum" name="geburtsdatum" type="date" defaultValue={data.geburtsdatum} {...invalid("mc-geburtsdatum", fehler.geburtsdatum)} onInput={() => clear("geburtsdatum")} />
                        </Field>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="mc-handy">Handynummer</Label>
                        <HandyEingabe
                          id="mc-handy"
                          wert={handy}
                          onChange={(w) => {
                            setHandy(w);
                            clear("handynummer");
                          }}
                          autoComplete="off"
                          fehler={fehler.handynummer}
                        />
                      </div>
                    </Abschnitt>

                    <Abschnitt titel="Anschrift">
                      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                        <Field id="mc-strasse" label="Straße" fehler={fehler.strasse}>
                          <Input id="mc-strasse" name="strasse" defaultValue={data.strasse} autoComplete="off" {...invalid("mc-strasse", fehler.strasse)} onInput={() => clear("strasse")} />
                        </Field>
                        <Field id="mc-hausnummer" label="Hausnr." fehler={fehler.hausnummer}>
                          <Input id="mc-hausnummer" name="hausnummer" defaultValue={data.hausnummer} autoComplete="off" {...invalid("mc-hausnummer", fehler.hausnummer)} onInput={() => clear("hausnummer")} />
                        </Field>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="mc-land">Land</Label>
                        <LandAuswahl
                          id="mc-land"
                          wert={land}
                          onChange={(l) => {
                            setLand(l);
                            clear("land", "plz", "hausnummer", "ort");
                          }}
                          fehler={fehler.land}
                        />
                      </div>
                      <div className="grid grid-cols-[6.5rem_1fr] gap-3">
                        <Field id="mc-plz" label="PLZ" fehler={fehler.plz}>
                          <Input id="mc-plz" name="plz" defaultValue={data.plz} inputMode={plzInputMode(land)} autoComplete="off" {...invalid("mc-plz", fehler.plz)} onInput={() => clear("plz")} />
                        </Field>
                        <Field id="mc-ort" label="Ort" fehler={fehler.ort}>
                          <Input id="mc-ort" name="ort" defaultValue={data.ort} autoComplete="off" {...invalid("mc-ort", fehler.ort)} onInput={() => clear("ort")} />
                        </Field>
                      </div>
                    </Abschnitt>

                    <Abschnitt titel="Bankverbindung">
                      <div className="grid gap-1.5">
                        <Label htmlFor="mc-iban">Neue IBAN</Label>
                        <IbanEingabe
                          id="mc-iban"
                          wert={iban}
                          onChange={(w) => {
                            setIban(w);
                            clear("iban");
                          }}
                          placeholder={data.ibanMasked || "Keine IBAN hinterlegt"}
                          fehler={fehler.iban}
                          describedBy="mc-iban-hinweis"
                        />
                        <FeldHinweis id="mc-iban-hinweis">
                          Leer lassen, um die bisherige IBAN zu behalten. Eine neue IBAN gilt im nächsten SEPA-Export als
                          Mandatsänderung.
                        </FeldHinweis>
                      </div>
                      <Field id="mc-bic" label="BIC (optional)" fehler={fehler.bic}>
                        <Input
                          id="mc-bic"
                          name="bic"
                          defaultValue={data.bic}
                          autoComplete="off"
                          spellCheck={false}
                          className="font-mono tracking-wide"
                          {...invalid("mc-bic", fehler.bic)}
                          onInput={() => clear("bic")}
                        />
                        {!fehler.bic && <FeldHinweis>{data.bicHinweis}</FeldHinweis>}
                      </Field>
                    </Abschnitt>
                  </div>
                )}

                {datenFehler && (
                  <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {datenFehler}
                  </p>
                )}
              </div>

              <div className="sticky bottom-0 mt-3 flex justify-end gap-2.5 border-t border-border bg-card px-6 pt-4 pb-5">
                <Button type="button" variant="outline" className="h-10 px-[18px]" onClick={schliessen} disabled={saving}>
                  Abbrechen
                </Button>
                <Button type="submit" className="h-10 px-[18px] font-semibold" disabled={saving || (!data && !loadError)}>
                  {saving ? "Wird gespeichert …" : "Speichern"}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{titel}</h3>
      {children}
    </section>
  );
}

function Field({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FeldFehler id={`${id}-fehler`}>{fehler}</FeldFehler>
    </div>
  );
}
