"use client";

import { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

// Bot-Schutz für Login und Passwort-vergessen. Das Widget legt selbst ein verstecktes Feld
// „cf-turnstile-response“ im Formular an; geprüft wird serverseitig (lib/bot-protection.ts).
// Sichtbar wird es nur, wenn Cloudflare eine Interaktion verlangt.
// Tokens sind einmalig gültig: nach jeder Serverantwort (resetKey ändert sich) neu lösen.

const DEV_BYPASS_TOKEN = "localhost-bypass";

export function TurnstileField({
  resetKey,
  onTokenChange,
}: {
  resetKey: unknown;
  onTokenChange: (ready: boolean) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const isDevelopment = process.env.NODE_ENV === "development";
  const ref = useRef<TurnstileInstance | undefined>(undefined);
  const firstRender = useRef(true);
  // Lokal schlägt das Widget fehl, wenn localhost nicht als Domain freigegeben ist.
  const [devBypass, setDevBypass] = useState(!siteKey && isDevelopment);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!siteKey || devBypass) return;
    onTokenChange(false);
    ref.current?.reset();
  }, [resetKey, siteKey, devBypass, onTokenChange]);

  useEffect(() => {
    if (devBypass) onTokenChange(true);
  }, [devBypass, onTokenChange]);

  if (devBypass) return <input type="hidden" name="cf-turnstile-response" value={DEV_BYPASS_TOKEN} readOnly />;
  if (!siteKey) return null;

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      onSuccess={() => onTokenChange(true)}
      onExpire={() => onTokenChange(false)}
      onError={() => (isDevelopment ? setDevBypass(true) : onTokenChange(false))}
      options={{ theme: "light", size: "flexible", appearance: "interaction-only" }}
    />
  );
}
