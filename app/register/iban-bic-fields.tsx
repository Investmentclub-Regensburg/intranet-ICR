"use client";

import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateIBAN, validateBICFormat } from "@/lib/iban";
import { ibanInViererbloecken } from "@/lib/member-rules-client";
import { FeldFehler, FeldHinweis, IbanEingabe } from "@/components/member/MemberInputs";
import { bicLandHinweis } from "@/lib/member-inputs";
import { validateIbanAction } from "./validate-iban-action";

type IbanBicFieldsProps = {
  initialIban?: string;
  initialBic?: string;
  /** Fehler je Feld vom Server (lib/member-rules.ts). */
  serverErrors?: { iban?: string; bic?: string };
  /** Feld wurde geändert (Fehler vom Server wegnehmen). */
  onEdit?: (feld: "iban" | "bic") => void;
};

/**
 * IBAN (in Viererblöcken, Live-Check über openiban.com – nur in der Registrierung, so steht es in der
 * Datenschutzerklärung) und BIC (optional). Entscheidend ist die Prüfung auf dem Server.
 */
export function IbanBicFields({ initialIban = "", initialBic = "", serverErrors, onEdit }: IbanBicFieldsProps) {
  const [iban, setIban] = useState(() => ibanInViererbloecken(initialIban));
  const [bic, setBic] = useState(initialBic);
  // Neue Startwerte (z. B. nach fehlgeschlagenem Absenden) übernehmen – während des Renderns statt
  // per Effekt (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [prevInitial, setPrevInitial] = useState({ iban: initialIban, bic: initialBic });
  if (prevInitial.iban !== initialIban || prevInitial.bic !== initialBic) {
    setPrevInitial({ iban: initialIban, bic: initialBic });
    setIban(ibanInViererbloecken(initialIban));
    setBic(initialBic);
  }
  const [ibanError, setIbanError] = useState<string | null>(null);
  const [bicError, setBicError] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [ibanLoading, setIbanLoading] = useState(false);
  const ibanRef = useRef<HTMLInputElement>(null);
  const bicRef = useRef<HTMLInputElement>(null);

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

  const handleBicBlur = useCallback(() => {
    const value = bic.replace(/\s/g, "").trim();
    setBicError(null);
    bicRef.current?.setCustomValidity("");
    if (!value) return;

    if (!validateBICFormat(value)) {
      setBicError("Die BIC hat 8 oder 11 Zeichen, z. B. COBADEFFXXX.");
      bicRef.current?.setCustomValidity("BIC-Format ungültig.");
    }
  }, [bic]);

  const ibanFehler = ibanError ?? serverErrors?.iban ?? undefined;
  const bicFehler = bicError ?? serverErrors?.bic ?? undefined;

  return (
    <div className="space-y-4">
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
            onEdit?.("iban");
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
      <div className="space-y-2">
        <Label htmlFor="bic">BIC (optional)</Label>
        <Input
          ref={bicRef}
          id="bic"
          name="bic"
          type="text"
          placeholder="COBADEFFXXX"
          value={bic}
          onChange={(e) => {
            setBic(e.target.value.replace(/\s/g, "").toUpperCase());
            if (bicError) setBicError(null);
            bicRef.current?.setCustomValidity("");
            onEdit?.("bic");
          }}
          onBlur={handleBicBlur}
          autoComplete="off"
          spellCheck={false}
          className="h-11 font-mono tracking-wide"
          aria-invalid={bicFehler ? true : undefined}
          aria-describedby={bicFehler ? "bic-fehler" : undefined}
        />
        <FeldFehler id="bic-fehler">{bicFehler}</FeldFehler>
        {!bicFehler && <FeldHinweis>{bicLandHinweis(iban, bic)}</FeldHinweis>}
      </div>
    </div>
  );
}
