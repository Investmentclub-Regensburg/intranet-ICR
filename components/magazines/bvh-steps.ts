// Fortschritt „So läuft es ab“ beim BVH-Zugang (Design-Runde 19.11.2026): aktueller Schritt, Füllstand des
// Balkens und Zustand je Punkt. Rein, ohne I/O, getestet in tests/bvh-steps.test.mjs.

export type BvhPhase = "none" | "requested" | "handled";

export type BvhStatusEingang = { hasRequested: boolean; handled: boolean };

export function bvhPhase(status: BvhStatusEingang): BvhPhase {
  return status.handled ? "handled" : status.hasRequested ? "requested" : "none";
}

/** Aktueller Schritt (0 = beantragen, 1 = Vorstand, 2 = Portal). Eingerichtet: Schritt 3 bleibt der aktuelle. */
export function aktuellerSchritt(phase: BvhPhase): 0 | 1 | 2 {
  return phase === "none" ? 0 : phase === "requested" ? 1 : 2;
}

/** Füllstand des Balkens in Prozent: 0 ohne Antrag, 50 beantragt, 100 eingerichtet. */
export function fuellstand(phase: BvhPhase): 0 | 50 | 100 {
  return phase === "none" ? 0 : phase === "requested" ? 50 : 100;
}

export type PunktZustand = "done" | "active" | "todo";

/** Zustand eines Punkts: erledigt (Häkchen), aktuell (Ring) oder offen. Eingerichtet: alle erledigt. */
export function punktZustand(phase: BvhPhase, schritt: number): PunktZustand {
  const aktuell = aktuellerSchritt(phase);
  if (schritt < aktuell || (phase === "handled" && schritt === 2)) return "done";
  return schritt === aktuell ? "active" : "todo";
}
