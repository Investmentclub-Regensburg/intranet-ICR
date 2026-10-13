/**
 * Vorstand des ICR für die Seite /board-members.
 *
 * Quelle: Website verein.json, Stand 2026-10-08
 * (clients/kunde-investmentclub-regensburg/src/data/verein.json, „vorstand“, Reihenfolge wie dort).
 * Bildausschnitt (fokus, zoom) aus src/data/bilder-manifest.json der Website, Fotos als
 * Kopie unter public/board/. Bei einem neuen Vorstand: Daten und Fotos hier mitziehen.
 */

export type VorstandMitglied = {
  name: string;
  rolle: string;
  bereich: string;
  linkedin: string;
  foto: string;
  /** object-position des Porträts (Kopf bleibt im Hochformat sichtbar). */
  fokus: string;
  /** Vergrößerung, falls das Original zu weit gefasst ist. */
  zoom?: number;
};

export const VORSTAND_AMTSZEIT = "2026–2027";

export const VORSTAND: VorstandMitglied[] = [
  {
    name: "Sarah Adloff",
    rolle: "Chief Executive Officer",
    bereich: "Acquisition & Relations, Planning, Strategy, Risk & Events",
    linkedin: "https://www.linkedin.com/in/sarah-isabelle-adloff-80b6492a0/",
    foto: "/board/sarah-adloff.webp",
    fokus: "45% 25%",
  },
  {
    name: "Maximilian Thiel",
    rolle: "Chief Financial Officer",
    bereich: "Finance, Legal & HR",
    linkedin: "https://www.linkedin.com/in/maximilian-thiel-499865246/",
    foto: "/board/maximilian-thiel.webp",
    fokus: "50% 40%",
  },
  {
    name: "Kilian Kainz",
    rolle: "Chief Marketing Officer",
    bereich: "Marketing & Social Media",
    linkedin: "https://www.linkedin.com/in/kilian-kainz-487579298/",
    foto: "/board/kilian-kainz.webp",
    fokus: "50% 12%",
    zoom: 1.3,
  },
  {
    name: "Simon Kirchner",
    rolle: "Chief Investment Officer",
    bereich: "Analyst Program & Education",
    linkedin: "https://www.linkedin.com/in/simon-kirchner-abb709260/",
    foto: "/board/simon-kirchner.webp",
    fokus: "50% 35%",
  },
  {
    name: "Justin Bolfrey",
    rolle: "Head of Information Technology",
    bereich: "Website & IT Administration",
    linkedin: "https://www.linkedin.com/in/justin-bolfrey-93a45a296/",
    foto: "/board/justin-bolfrey.webp",
    fokus: "50% 38%",
  },
];
