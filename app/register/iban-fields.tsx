"use client";

import { useState, useCallback, useRef } from "react";
import { Label } from "@/components/ui/label";
import { validateIBAN } from "@/lib/iban";
import { ibanInViererbloecken } from "@/lib/member-rules-client";
import { IbanEingabe } from "@/components/member/MemberInputs";
import { validateIbanAction } from "./validate-iban-action";

type IbanFieldsProps = {
  initialIban?: string;
  /** Fehler vom Server (lib/member-rules.ts). */
  serverErrors?: { iban?: string };
  /** Feld wurde geändert (Fehler vom Server wegnehmen). */
  onEdit?: () => void;
};

/**
 * IBAN in Viererblöcken, Live-Check über openiban.com (nur in der Registrierung, so steht es in der
 * Datenschutzerklärung). Entscheidend ist die Prüfung auf dem Server. Eine BIC wird seit 20.11.2026 nicht mehr
 * abgefragt (Entscheidung Hannes: im EWR genügt die IBAN).
 */
export function IbanFields({ initialIban = "", serverErrors, onEdit }: IbanFieldsProps) {
  const [iban, setIban] = useState(() => ibanInViererbloecken(initialIban));
  // Neue Startwerte (z. B. nach fehlgeschlagenem Absenden) übernehmen – während des Renderns statt
  // per Effekt (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevInitial, setPrevInitial] = useState(initialIban);
  if (prevInitial !== initialIban) {
    setPrevInitial(initialIban);
    setIban(ibanInViererbloecken(initialIban));
  }
  const [ibanError, setIbanError] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [ibanLoading, setIbanLoading] = useState(false);
  const ibanRef = useRef<HTMLInputElement>(null);

  const handleIbanBlur = useCallback(async () => {
    const value = iban.replace(/\s/g, "").trim();
    setBankName(null);
    setIbanError(null);
    ibanRef.current?.setCustomValidity("");

    if (!value) return;

    if (!validateIBAN(value)) {
      setIbanError("Die IBAN stimmt so nicht (Länge oder Prüfziffer). Nur Konten aus dem SEPA-Raum.");
      ibanRef.current?.setCustomValidity("IBAN ist ungültig.");
      return;
    }

    ibanRef.current?.setCustomValidity("");
    setIbanLoading(true);
    try {
      const result = await validateIbanAction(value);
      if (result.valid) {
        setIbanError(null);
        setBankName(result.bankName ?? null);
        ibanRef.current?.setCustomValidity("");
      } else {
        setIbanError(result.error ?? "IBAN konnte nicht geprüft werden.");
        setBankName(null);
        ibanRef.current?.setCustomValidity(result.error ?? "Ungültige IBAN");
      }
    } finally {
      setIbanLoading(false);
    }
  }, [iban]);

  const ibanFehler = ibanError ?? serverErrors?.iban ?? undefined;

  return (
    <div className="space-y-2 [&_input]:h-11">
      <Label htmlFor="iban">IBAN</Label>
      <IbanEingabe
        id="iban"
        inputRef={ibanRef}
        wert={iban}
        onChange={(wert) => {
          setIban(wert);
          if (ibanError) setIbanError(null);
          if (bankName) setBankName(null);
          ibanRef.current?.setCustomValidity("");
          onEdit?.();
        }}
        onBlur={handleIbanBlur}
        required
        fehler={ibanFehler}
        describedBy={bankName ? "iban-bank" : undefined}
      />
      {ibanLoading && <p className="text-xs text-muted-foreground">Wird geprüft…</p>}
      {bankName && !ibanFehler && (
        <p id="iban-bank" className="text-sm text-muted-foreground">
          Bank: {bankName}
        </p>
      )}
    </div>
  );
}
