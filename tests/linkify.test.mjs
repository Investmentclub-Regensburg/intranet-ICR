// Tests für lib/linkify.ts – Ausführen mit `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkifyText } from "../lib/linkify.ts";

const links = (text) => linkifyText(text).filter((p) => p.type === "link").map((p) => [p.value, p.href]);

test("http(s)- und www-Links werden erkannt", () => {
  assert.deepEqual(links("Anmeldung: https://forms.gle/abc123 bis Freitag"), [["https://forms.gle/abc123", "https://forms.gle/abc123"]]);
  assert.deepEqual(links("Infos auf www.icr.de/events"), [["www.icr.de/events", "https://www.icr.de/events"]]);
  assert.deepEqual(links("http://a.de und https://b.de"), [["http://a.de", "http://a.de"], ["https://b.de", "https://b.de"]]);
});

test("Satzzeichen und Klammern am Ende gehören nicht zum Link", () => {
  assert.deepEqual(links("Siehe https://a.de/x."), [["https://a.de/x", "https://a.de/x"]]);
  assert.deepEqual(links("(mehr unter https://a.de/x)"), [["https://a.de/x", "https://a.de/x"]]);
  assert.deepEqual(links("https://de.wikipedia.org/wiki/A_(B)"), [["https://de.wikipedia.org/wiki/A_(B)", "https://de.wikipedia.org/wiki/A_(B)"]]);
  assert.deepEqual(links("„https://a.de“"), [["https://a.de", "https://a.de"]]);
});

test("Text bleibt vollständig erhalten, keine gefährlichen Schemata", () => {
  const text = "Vorher https://a.de/x?y=1&z=2, nachher.";
  assert.equal(linkifyText(text).map((p) => p.value).join(""), text);
  assert.deepEqual(links("javascript:alert(1) data:text/html,x mailto:a@b.de"), []);
  assert.deepEqual(links("Kein Link hier"), []);
});

test("weitere Randfälle und Laufzeit", () => {
  assert.deepEqual(links("[https://a.de] **https://b.de** https://c.de…"), [
    ["https://a.de", "https://a.de"],
    ["https://b.de", "https://b.de"],
    ["https://c.de", "https://c.de"],
  ]);
  assert.deepEqual(links("www.javascript:alert(1)"), [["www.javascript:alert(1)", "https://www.javascript:alert(1)"]]);
  const start = Date.now();
  const parts = linkifyText("https://a.de/" + ")".repeat(50000));
  assert.ok(Date.now() - start < 500);
  assert.equal(parts[0].value, "https://a.de/");
});
