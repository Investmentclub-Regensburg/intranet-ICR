// Tests für lib/safe-redirect.ts – Ausführen mit `npm test` (Node >= 22.18, TypeScript-Typ-Stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath, safeRedirectPath } from "../lib/safe-redirect.ts";

test("lässt normale Intranet-Pfade durch", () => {
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
  assert.equal(safeNextPath("/events/0b7c4a7e-1234-4cde-8f00-123456789abc"), "/events/0b7c4a7e-1234-4cde-8f00-123456789abc");
  assert.equal(safeNextPath("/members?q=anna#liste"), "/members?q=anna#liste");
  assert.equal(safeNextPath("/events?ref=%2F%2Fx"), "/events?ref=%2F%2Fx");
});

test("verwirft alles, was kein String ist oder leer/zu lang ist", () => {
  for (const value of [undefined, null, 42, ["/dashboard"], {}, "", "/" + "a".repeat(2000)]) {
    assert.equal(safeNextPath(value), null, String(value));
  }
});

test("verwirft absolute und protokollrelative Ziele", () => {
  for (const value of [
    "https://example.org",
    "http://example.org/dashboard",
    "//example.org",
    "///example.org",
    "javascript:alert(1)",
    "dashboard",
    " /dashboard",
  ]) {
    assert.equal(safeNextPath(value), null, value);
  }
});

test("verwirft Backslashes und Steuerzeichen (roh und kodiert)", () => {
  for (const value of [
    "/\\example.org",
    "\\\\example.org",
    "/\t/example.org",
    "/\n/example.org",
    "/\r/example.org",
    "/%09/example.org",
    "/%0a/example.org",
    "/%0D/example.org",
    "/%5Cexample.org",
    "/%5cexample.org",
    "/%2F/example.org",
    "/%2f%2fexample.org",
    "/%252F/example.org",
    "/%25252F/example.org",
    "/dashboard%00",
    "/dashboard\u0085",
  ]) {
    assert.equal(safeNextPath(value), null, JSON.stringify(value));
  }
});

test("verwirft ungültige Prozent-Kodierung", () => {
  assert.equal(safeNextPath("/members?q=100%"), null);
  assert.equal(safeNextPath("/%E0%A4%A"), null);
});

test("verwirft Ziele auf Login-/Auth-Seiten (auch nach Normalisierung)", () => {
  for (const value of [
    "/login",
    "/login?next=/dashboard",
    "/LOGIN",
    "/register",
    "/forgot-password",
    "/auth/callback",
    "/events/../login",
    "/events/%2e%2e/login",
  ]) {
    assert.equal(safeNextPath(value), null, value);
  }
});

test("normalisiert Punkt-Segmente innerhalb der eigenen Origin", () => {
  assert.equal(safeNextPath("/events/../dashboard"), "/dashboard");
});

test("safeRedirectPath liefert immer einen Pfad mit Fallback", () => {
  assert.equal(safeRedirectPath("//example.org"), "/dashboard");
  assert.equal(safeRedirectPath(null), "/dashboard");
  assert.equal(safeRedirectPath("/%09/example.org", "/reset-password"), "/reset-password");
  assert.equal(safeRedirectPath("/profile"), "/profile");
});
