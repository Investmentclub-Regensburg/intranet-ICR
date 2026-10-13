// Datenformen der Übersicht (/dashboard). Fertig formatiert auf dem Server
// (Zeitzone Europe/Berlin), damit die Kacheln nur noch anzeigen.

export type DashboardEvent = {
  id: string;
  title: string;
  /** Volles Datum für Screenreader, z. B. „Sa., 17. Oktober 2026“. */
  dateLabel: string;
  /** Datumsblock: „17“, „Okt“, „Sa“. */
  day: string;
  month: string;
  weekday: string;
  /** „19:00 – 22:00 Uhr“ oder leer. */
  timeLabel: string;
  location: string | null;
  /** „Heute“, „Morgen“, „In 3 Tagen“, „In 2 Wochen“ … */
  relative: string;
  /** Heute oder morgen: Hinweis betont. */
  soon: boolean;
  requiresRegistration: boolean;
  /** Eingeloggtes Mitglied ist angemeldet. */
  registered: boolean;
};

export type DashboardNewsItem = {
  id: string;
  title: string;
  /** Anfang des Textes, ohne Zeilenumbrüche. */
  excerpt: string;
  createdAt: string;
  /** „7. Okt.“ */
  dateLabel: string;
  /** Neuer als der letzte Besuch der News-Seite. */
  unread: boolean;
};

/** Zählwerte für die Verwaltungszeile (nur admin/board). Keine Personendaten. */
export type AdminCounts = {
  /** Alumni-Anträge mit Status „pending“. */
  alumniRequests: number;
  /** BVH-Anfragen, noch nicht abgehakt. */
  bvhRequests: number;
  /** Status „active“ ohne Alumni (wie Insights). */
  activeMembers: number;
  /** Seit Semesterbeginn eingetreten und freigegeben. */
  newThisSemester: number;
  /** „WiSe 26/27“ */
  semesterLabel: string;
};
