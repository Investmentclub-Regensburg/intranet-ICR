// Tests für den Fortschritt beim BVH-Zugang (Vorteile, Design-Runde 19.11.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerSchritt, bvhPhase, fuellstand, punktZustand } from "../components/magazines/bvh-steps.ts";

test("Phase aus dem Status: eingerichtet geht vor beantragt", () => {
  assert.equal(bvhPhase({ hasRequested: false, handled: false }), "none");
  assert.equal(bvhPhase({ hasRequested: true, handled: false }), "requested");
  assert.equal(bvhPhase({ hasRequested: true, handled: true }), "handled");
  assert.equal(bvhPhase({ hasRequested: false, handled: true }), "handled");
});

test("Füllstand 0 / 50 / 100 und aktueller Schritt", () => {
  assert.deepEqual(["none", "requested", "handled"].map(fuellstand), [0, 50, 100]);
  assert.deepEqual(["none", "requested", "handled"].map(aktuellerSchritt), [0, 1, 2]);
});

test("Punkte je Phase", () => {
  const punkte = (phase) => [0, 1, 2].map((i) => punktZustand(phase, i));
  assert.deepEqual(punkte("none"), ["active", "todo", "todo"]);
  assert.deepEqual(punkte("requested"), ["done", "active", "todo"]);
  assert.deepEqual(punkte("handled"), ["done", "done", "done"]);
});
