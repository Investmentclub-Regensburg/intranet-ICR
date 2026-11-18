// Tests für siteRedirectUrl (lib/site-url.ts): Weiterleitungen dürfen im Container nicht auf 0.0.0.0 zeigen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteRedirectUrl } from "../lib/site-url.ts";

const INTERN = "http://0.0.0.0:3000/auth/confirm?token_hash=x&type=signup";

function mitSiteUrl(wert, fn) {
  const alt = process.env.NEXT_PUBLIC_SITE_URL;
  if (wert === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = wert;
  try {
    fn();
  } finally {
    if (alt === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = alt;
  }
}

test("mit NEXT_PUBLIC_SITE_URL: Basis ist die eingestellte Adresse, nicht die interne Container-Adresse", () => {
  mitSiteUrl("https://myicr.investmentclubregensburg.com", () => {
    assert.equal(siteRedirectUrl("/dashboard", INTERN).href, "https://myicr.investmentclubregensburg.com/dashboard");
    assert.equal(
      siteRedirectUrl("/login?error=Invalid_or_expired_token", INTERN).href,
      "https://myicr.investmentclubregensburg.com/login?error=Invalid_or_expired_token"
    );
  });
});

test("Pfad in der eingestellten Adresse wird ignoriert, nur der Origin zählt", () => {
  mitSiteUrl("https://webserver01.tail74a8aa.ts.net:8443/irgendwas", () => {
    assert.equal(siteRedirectUrl("/reset-password", INTERN).href, "https://webserver01.tail74a8aa.ts.net:8443/reset-password");
  });
});

test("ohne oder mit ungültiger Konfiguration: wie bisher die Adresse der Anfrage", () => {
  mitSiteUrl(undefined, () => {
    assert.equal(siteRedirectUrl("/login", "http://localhost:3000/auth/callback").href, "http://localhost:3000/login");
  });
  mitSiteUrl("kein-url", () => {
    assert.equal(siteRedirectUrl("/login", "http://localhost:3000/x").href, "http://localhost:3000/login");
  });
});
