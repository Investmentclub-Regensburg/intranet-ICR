"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FeldFehler,
  FeldHinweis,
  GespeichertHaken,
  HandyEingabe,
  IbanEingabe,
  LandAuswahl,
  type HandyWert,
} from "@/components/member/MemberInputs";
import { plzInputMode } from "@/lib/member-inputs";
import {
  correctMemberData,
  getMemberCorrectionData,
  type MemberCorrectionData,
} from "@/app/(intranet)/admin/members/actions";

type Fehler = Partial<Record<string, string>>;

/**
 * Korrektur der verschlüsselten Mitgliedsdaten durch den Vorstand (Adresse mit Land, Handy mit Länderauswahl,
 * Geburtsdatum, Bankverbindung). Die Daten werden erst beim Öffnen geladen; die IBAN erscheint nur gekürzt und
 * wird durch Neueingabe ersetzt (leer = unverändert). Der Server prüft nur geänderte Felder (alte Fehler in
 * anderen Feldern blockieren nicht) und meldet Fehler je Feld. Jede Korrektur wird protokolliert (nur Feldnamen).
 */
export function MemberCorrectionDialog({ profileId, name }: { profileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MemberCorrectionData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fehler, setFehler] = useState<Fehler>({});
  const [land, setLand] = useState("DE");
  const [handy, setHandy] = useState<HandyWert>({ land: "DE", nummer: "" });
  const [iban, setIban] = useState("");
  // Antwort eines inzwischen geschlossenen Dialogs verwerfen.
  const request = useRef(0);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    const current = ++request.current;
    setFehler({});
    setSaved(false);
    if (!next) {
      // Entschlüsselte Werte nicht im Speicher der Seite behalten.
      setData(null);
      setLoadError("");
      setHandy({ land: "DE", nummer: "" });
      setIban("");
      return;
    }
    const result = await getMemberCorrectionData(profileId).catch(() => ({ error: "Daten konnten nicht geladen werden." }));
    if (current !== request.current) return;
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setData(result.data);
    setLand(result.data.land);
    setHandy({ land: result.data.handyLand, nummer: result.data.handynummer });
    setIban("");
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
    if (!data) return;
    setSaving(true);
    setFehler({});
    try {
      const result = await correctMemberData(
        profileId,
        {
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
        },
        data
      );
      if (result.fehler && Object.keys(result.fehler).length > 0) {
        setFehler(result.fehler);
        return;
      }
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.unchanged) {
        toast.success("Keine Änderungen.");
        await handleOpenChange(false);
        return;
      }
      setSaved(true);
    } catch {
      toast.error("Korrektur konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  const invalid = (id: string, f?: string) =>
    f ? { "aria-invalid": true as const, "aria-describedby": `${id}-fehler` } : {};

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => handleOpenChange(true)}
        aria-label={`Daten von ${name} korrigieren`}
        title="Daten korrigieren"
      >
        <PencilLine className="size-4" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Daten korrigieren</DialogTitle>
            <DialogDescription>
              {data?.name ?? name}. Änderungen werden mit deinem Namen protokolliert (ohne Werte).
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Wird geladen …</p>
          ) : saved ? (
            <GespeichertHaken
              text="Daten korrigiert"
              onFertig={() => {
                void handleOpenChange(false);
                router.refresh();
              }}
            />
          ) : (
            <form onSubmit={handleSubmit} noValidate className="grid gap-4">
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
              <Field id="mc-geburtsdatum" label="Geburtsdatum" fehler={fehler.geburtsdatum}>
                <Input id="mc-geburtsdatum" name="geburtsdatum" type="date" defaultValue={data.geburtsdatum} {...invalid("mc-geburtsdatum", fehler.geburtsdatum)} onInput={() => clear("geburtsdatum")} />
              </Field>
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Wird gespeichert …" : "Speichern"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
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
