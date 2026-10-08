"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateIBAN, validateBICFormat } from "@/lib/iban";
import { validateIbanAction } from "./validate-iban-action";

type IbanBicFieldsProps = {
  initialIban?: string;
  initialBic?: string;
};

export function IbanBicFields({ initialIban = "", initialBic = "" }: IbanBicFieldsProps) {
  const [iban, setIban] = useState(initialIban);
  const [bic, setBic] = useState(initialBic);
  useEffect(() => {
    setIban(initialIban);
    setBic(initialBic);
  }, [initialIban, initialBic]);
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
      setIbanError("IBAN ist ungültig (Format oder Prüfsumme).");
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
        setIbanError(result.error ?? "IBAN konnte nicht validiert werden.");
        setBankName(null);
        ibanRef.current?.setCustomValidity(result.error ?? "Ungültige IBAN");
      }
    } finally {
      setIbanLoading(false);
    }
  }, [iban]);

  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, "").toUpperCase();
    setIban(value);
    if (ibanError) setIbanError(null);
    if (bankName) setBankName(null);
  };

  const handleBicBlur = useCallback(() => {
    const value = bic.replace(/\s/g, "").trim();
    setBicError(null);
    bicRef.current?.setCustomValidity("");
    if (!value) return;

    if (!validateBICFormat(value)) {
      setBicError("BIC muss 8 oder 11 Zeichen haben (z.B. COBADEFFXXX).");
      bicRef.current?.setCustomValidity("BIC-Format ungültig.");
    }
  }, [bic]);

  const handleBicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBic(e.target.value.replace(/\s/g, "").toUpperCase());
    if (bicError) setBicError(null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="iban">IBAN</Label>
        <Input
          ref={ibanRef}
          id="iban"
          name="iban"
          type="text"
          placeholder="DE89 3704 0044 0532 0130 00"
          required
          value={iban}
          onChange={handleIbanChange}
          onBlur={handleIbanBlur}
          className={ibanError ? "h-11 border-destructive" : "h-11"}
          aria-invalid={!!ibanError}
          aria-describedby={ibanError ? "iban-error" : bankName ? "iban-bank" : undefined}
        />
        {ibanLoading && (
          <p className="text-xs text-muted-foreground">Wird geprüft…</p>
        )}
        {ibanError && (
          <p id="iban-error" className="text-sm text-destructive" role="alert">
            {ibanError}
          </p>
        )}
        {bankName && !ibanError && (
          <p id="iban-bank" className="text-sm text-muted-foreground">
            Bank: {bankName}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="bic">BIC</Label>
        <Input
          ref={bicRef}
          id="bic"
          name="bic"
          type="text"
          placeholder="COBADEFFXXX"
          required
          value={bic}
          onChange={handleBicChange}
          onBlur={handleBicBlur}
          className={bicError ? "h-11 border-destructive" : "h-11"}
          aria-invalid={!!bicError}
          aria-describedby={bicError ? "bic-error" : undefined}
        />
        {bicError && (
          <p id="bic-error" className="text-sm text-destructive" role="alert">
            {bicError}
          </p>
        )}
      </div>
    </div>
  );
}
