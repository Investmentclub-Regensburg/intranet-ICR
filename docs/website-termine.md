# Termine auf der Website (`website_events`)

Die Website (investmentclubregensburg.com) holt die öffentlichen Termine über
`POST /rest/v1/rpc/website_events` mit dem öffentlichen Schlüssel. Definiert ist die Funktion in
`supabase/migrations/20261020110000_website_events_end_date.sql`.

## Felder

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | uuid | ID des Events |
| `title` | text | Titel |
| `event_date` | `JJJJ-MM-TT` | Erster (bzw. einziger) Tag |
| `end_date` | `JJJJ-MM-TT` oder `null` | **Neu (Oktober 2026):** letzter Tag bei mehrtägigen Events, sonst `null` |
| `event_time` | `hh:mm:ss` oder `null` | Beginn; `null` = ganztägig |
| `end_time` | `hh:mm:ss` oder `null` | Ende (siehe unten) |
| `location` | text oder `null` | Ort |
| `organizer` | text oder `null` | Veranstalter |
| `requires_registration` | boolean | Anmeldung im Intranet nötig (nur Mitglieder) |

Alle Daten und Zeiten sind Berliner Ortszeit ohne Zeitzone. Bitte nicht über `new Date("2026-10-23")`
umrechnen, sonst verschiebt die Server-Zeitzone den Tag.

## Wie `end_time` zu lesen ist

- **`end_date` ist `null` (eintägig):** wie bisher. Liegt `end_time` vor `event_time`, endet das Event am
  Folgetag (z. B. 19:00–02:00).
- **`end_date` ist gesetzt (mehrtägig):** `event_time` gilt für den **ersten** Tag, `end_time` für den
  **letzten** Tag. Keine Folgetag-Regel. `end_date` liegt immer nach `event_date` (höchstens 31 Tage).

## Beispiel für die Anzeige

```js
const fmt = (d, opts) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("de-DE", { ...opts, timeZone: "UTC" });
};
const hhmm = (t) => (t ? t.slice(0, 5) : "");

function wann(e) {
  const lang = { weekday: "short", day: "numeric", month: "long", year: "numeric" };
  const s = hhmm(e.event_time);
  const en = hhmm(e.end_time);

  if (e.end_date) {
    // "Fr., 23. Oktober – So., 25. Oktober 2026 · Beginn 09:00 Uhr · Ende 18:00 Uhr"
    const gleichesJahr = e.event_date.slice(0, 4) === e.end_date.slice(0, 4);
    const start = fmt(e.event_date, gleichesJahr ? { ...lang, year: undefined } : lang);
    const zeiten = s ? (en ? `Beginn ${s} Uhr · Ende ${en} Uhr` : `Beginn ${s} Uhr`) : "";
    return [`${start} – ${fmt(e.end_date, lang)}`, zeiten].filter(Boolean).join(" · ");
  }

  // eintägig wie bisher: "Fr., 23. Oktober 2026 · 19:00 – 22:00 Uhr"
  const zeiten = !s ? "" : !en ? `${s} Uhr` : `${s} – ${en} Uhr${en <= s ? " (Folgetag)" : ""}`;
  return [fmt(e.event_date, lang), zeiten].filter(Boolean).join(" · ");
}
```

**Vergangen oder anstehend:** Ein mehrtägiges Event läuft bis `end_date` (ohne `end_time`: bis Tagesende).
Zum Filtern also `end_date ?? event_date` mit dem heutigen Datum vergleichen, nicht nur `event_date`.
