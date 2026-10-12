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
  correctMemberData,
  getMemberCorrectionData,
  type MemberCorrectionData,
} from "@/app/(intranet)/admin/members/actions";

/**
 * Korrektur der verschlüsselten Mitgliedsdaten durch den Vorstand (Adresse, Telefon, Geburtsdatum,
 * Bankverbindung). Die Daten werden erst beim Öffnen geladen; die IBAN erscheint nur gekürzt und wird
 * durch Neueingabe ersetzt (leer = unverändert). Jede Korrektur wird protokolliert (nur Feldnamen).
 */
export function MemberCorrectionDialog({ profileId, name }: { profileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MemberCorrectionData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  // Antwort eines inzwischen geschlossenen Dialogs verwerfen.
  const request = useRef(0);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    const current = ++request.current;
    if (!next) {
      // Entschlüsselte Werte nicht im Speicher der Seite behalten.
      setData(null);
      setLoadError("");
      return;
    }
    const result = await getMemberCorrectionData(profileId).catch(() => ({ error: "Daten konnten nicht geladen werden." }));
    if (current !== request.current) return;
    if ("error" in result) setLoadError(result.error);
    else setData(result.data);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    if (!data) return;
    setSaving(true);
    try {
      const { error, unchanged } = await correctMemberData(profileId, {
        strasse: value("strasse"),
        hausnummer: value("hausnummer"),
        plz: value("plz"),
        ort: value("ort"),
        handynummer: value("handynummer"),
        geburtsdatum: value("geburtsdatum"),
        bic: value("bic"),
        iban: value("iban"),
      }, data);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(unchanged ? "Keine Änderungen." : "Daten korrigiert.");
      await handleOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Korrektur konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

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
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                <Field id="mc-strasse" label="Straße">
                  <Input id="mc-strasse" name="strasse" defaultValue={data.strasse} autoComplete="off" />
                </Field>
                <Field id="mc-hausnummer" label="Hausnr.">
                  <Input id="mc-hausnummer" name="hausnummer" defaultValue={data.hausnummer} autoComplete="off" />
                </Field>
              </div>
              <div className="grid grid-cols-[6.5rem_1fr] gap-3">
                <Field id="mc-plz" label="PLZ">
                  <Input id="mc-plz" name="plz" defaultValue={data.plz} inputMode="numeric" autoComplete="off" />
                </Field>
                <Field id="mc-ort" label="Ort">
                  <Input id="mc-ort" name="ort" defaultValue={data.ort} autoComplete="off" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="mc-handynummer" label="Handynummer">
                  <Input id="mc-handynummer" name="handynummer" type="tel" defaultValue={data.handynummer} autoComplete="off" />
                </Field>
                <Field id="mc-geburtsdatum" label="Geburtsdatum">
                  <Input id="mc-geburtsdatum" name="geburtsdatum" type="date" defaultValue={data.geburtsdatum} />
                </Field>
              </div>
              <Field id="mc-iban" label="Neue IBAN">
                <Input
                  id="mc-iban"
                  name="iban"
                  placeholder={data.ibanMasked || "Keine IBAN hinterlegt"}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono tracking-wide"
                />
                <span className="text-xs text-muted-foreground">
                  Leer lassen, um die bisherige IBAN zu behalten. Eine neue IBAN gilt im nächsten SEPA-Export
                  als Mandatsänderung.
                </span>
              </Field>
              <Field id="mc-bic" label="BIC">
                <Input
                  id="mc-bic"
                  name="bic"
                  defaultValue={data.bic}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono tracking-wide"
                />
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

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
