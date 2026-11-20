# Datenqualität der Mitgliederdaten (`scripts/datenqualitaet.mjs`)

Prüft die verschlüsselten Mitgliederdaten mit den Regeln aus `lib/member-rules.ts` und korrigiert nur, was
sicher ist. Aufbau, Zugangsdaten und Ziel wie `scripts/verschluesselung.mjs` (siehe `docs/verschluesselung.md`):
Service-Role-Key, Master Key und Key-ID kommen aus der Umgebung oder werden verdeckt abgefragt; das Skript
bricht ab, wenn der Key nicht zum registrierten Prüfwert passt. Nach einer Key-Rotation fragt es im Terminal
verdeckt nach älteren Keys (`MEMBER_DATA_OLD_MASTER_KEYS`, Format `id:base64,…`, leer = keine); sonst zählen Zeilen
mit altem Key als „nicht lesbar“ und werden übersprungen (vor dem Schreiben gibt es dann eine Warnung).

```
npm run datenqualitaet -- pruefen                --projekt <prod|test|lokal> [--url <adresse>] [--liste <datei>]
npm run datenqualitaet -- reparieren --probelauf --projekt <…>               [--url <adresse>] [--liste <datei>]
npm run datenqualitaet -- reparieren             --projekt <…> --vorstand <Profil-ID> [--url <adresse>]
```

- Produktion = eigener Server: `--projekt prod --url <adresse>`, z. B. über den SSH-Tunnel
  `http://localhost:8100`. `--url` ist Pflicht; das alte Cloud-Projekt und `ICR_SUPABASE_URL` sind nie ein stilles Ziel.
- Test-Projekt (Supabase Cloud): `--projekt test`, ohne `--url`. Es hat keine Testziel-Prüfung wie „lokal“; das ist
  nur unbedenklich, solange dort keine Kopie echter Mitgliederdaten liegt.
- Lokaler Stack: `--projekt lokal --url http://127.0.0.1:<port>`: nur mit ausdrücklichem `--url` auf localhost
  (nie aus `ICR_SUPABASE_URL`, nie Port 8100 = Tunnel zur Produktion), und nur, wenn die Datenbank höchstens
  200 Profile und ausschließlich Konten auf `@test.icr.local` hat (wie `seed.sql`).
- Reihenfolge: lokal bzw. Test-Projekt, dann Produktion.
- Strg+C über `npm run` unter Windows (`npm.cmd`/`npm.ps1`) ist nicht real erprobt, nur simuliert: Beim ersten
  schreibenden Lauf einmal beobachten, ob das Skript nach dem laufenden Profil sauber endet. Im Zweifel direkt
  `node --import ./scripts/lib/ts-paths.mjs scripts/datenqualitaet.mjs …` starten.

## Was geprüft und geändert wird

- **Betroffen** sind aktive Profile inklusive Vorstand und Alumni. Gekündigte Profile und offene Anträge werden
  nur gezählt, nie geändert. Bei Alumni ist die IBAN nie ein Mangel.
- **Pflichtfelder (Entscheidung Hannes 20.11.2026):** Handynummer und Anschrift sind freiwillig. Gezählt wird ein
  Mangel nur, wenn eine Handynummer angegeben, aber falsch ist, wenn die Anschrift nur teilweise angegeben ist
  (dann fehlen die übrigen Teile) oder wenn die IBAN aus einem SEPA-Land außerhalb des EWR kommt (dann ist die
  Anschrift Pflicht, nicht bei Alumni). Die BIC wird nicht mehr abgefragt, geprüft, gezählt oder geändert;
  gespeicherte Werte bleiben, wie sie sind.
- **`pruefen`**: Zählungen je Feld und Mängel-Code, die Hinweise (`vorwahl_ergaenzt`; kommt bei deutschen Nummern praktisch nicht mehr vor, siehe oben), Profile ohne
  `member_secrets`-Zeile und nicht lesbare Zeilen.
- **`reparieren --probelauf`**: je Feld, wie viele Profile `gueltig`, `sicher` (wird automatisch korrigiert),
  `vorschlag` (bestätigt das Mitglied in der Abfrage) oder `offen` (Mitglied oder Vorstand korrigiert) sind.
- **`reparieren`** schreibt **nur „sicher“**:
  - Handy mit deutschem Beleg (führende 0, `0049`, `+49 0`) → E.164 (auch nur Leerraum/harmlose Zeichen),
  - Handy 15/16/17 ohne 0 und `+49 1[567]…` ohne 0 → E.164 (Entscheidung Hannes 19.11.2026). Akzeptiertes
    Restrisiko: Chinesische Mobilnummern (15x/17x) und nordamerikanische Nummern ohne `+1` (z. B. `1 602 555 1234`)
    sehen genauso aus und werden als deutsch umgeschrieben. Der Probelauf zählt diese „nur angenommen deutschen“
    Handys getrennt von den belegten (nur Zahlen),
  - Straße mit Hausnummer bei leerer Hausnummer → abgetrennt; Straße/Hausnummer mit harmlosen Format-Zeichen
    (weiches Trennzeichen, Zero-Width, NFD) → bereinigt,
  - (bis 20.11.2026 auch „BIC mit falschem Format → geleert“; entfällt, weil die BIC nicht mehr geprüft wird und
    vorhandene Werte vorerst bleiben sollen. Der SEPA-Export nutzt eine BIC mit falschem Format nicht.)

  Vorschläge (z. B. Handy aus einem anderen Land als dem Standardland) und alles andere bleiben unangetastet, auch die IBAN.
  Vorher gibt das Skript den Probelauf aus und verlangt „REPARIEREN <projekt-ref bzw. adresse> <anzahl>“
  (Anzahl der zu ändernden Profile). Strg+C während des Schreibens beendet nach dem laufenden Profil und
  zeigt den Zwischenstand; ein zweites Strg+C beendet sofort (jedes Speichern ist für sich vollständig).
  Geschrieben wird je Profil über `saveMemberSecrets` mit dem gerade geprüften Stand: Hat sich die Zeile
  inzwischen geändert (Versionskonflikt), wird das Profil übersprungen und gezählt, nicht wiederholt. Jede
  Änderung steht mit `--vorstand` (aktives Profil mit Rolle `board`) und den Feldnamen in
  `member_data_corrections`. Straße und Hausnummer werden nur gemeinsam geschrieben. Ein Profil, dessen
  gespeicherte IBAN nicht normalisiert ist oder deren Fingerabdruck nicht passt, wird übersprungen und gezählt
  (sonst meldete `saveMemberSecrets` eine IBAN-Änderung). Ein zweiter Lauf ändert 0 Profile.

## Ausgabe und Liste

Die Ausgabe enthält nur Zahlen, Feldnamen und Codes, nie Werte, Namen, E-Mails oder Profil-IDs, auch nicht bei
Fehlern (dann nur Fehlerklasse und Code-Stellen). Wer die betroffenen Profile braucht, gibt ausdrücklich
`--liste <datei>` an (nur bei `pruefen` und beim Probelauf): eine TSV mit Profil-ID, Gruppe, Zeile vorhanden,
Mängeln (`feld:code`), Hinweisen und Feldnamen der Vorschläge bzw. automatischen Korrekturen, ohne Werte. Die
Datei muss außerhalb des Repos liegen (das Repo ist öffentlich), wird nie überschrieben (Abbruch, wenn es sie
schon gibt) und gehört nach der Arbeit gelöscht. Nicht in Cloud-synchronisierte Ordner (Nextcloud, OneDrive)
schreiben, sondern z. B. in einen Temp-Ordner.

## Land der Anschrift

Solange `land` noch kein gespeichertes Feld ist, gilt beim Prüfen Deutschland. Die gelesenen Felder stehen in
`GESPEICHERTE_FELDER` (`scripts/lib/datenqualitaet.mjs`); kommt `land` hinzu, wird es dort ergänzt.
