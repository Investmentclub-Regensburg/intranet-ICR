# Datenqualität der Mitgliederdaten (`scripts/datenqualitaet.mjs`)

Prüft die verschlüsselten Mitgliederdaten mit den Regeln aus `lib/member-rules.ts` und korrigiert nur, was
sicher ist. Aufbau, Zugangsdaten und Ziel wie `scripts/verschluesselung.mjs` (siehe `docs/verschluesselung.md`):
Service-Role-Key, Master Key und Key-ID kommen aus der Umgebung oder werden verdeckt abgefragt; das Skript
bricht ab, wenn der Key nicht zum registrierten Prüfwert passt.

```
npm run datenqualitaet -- pruefen                --projekt <prod|test|lokal> [--url <adresse>] [--liste <datei>]
npm run datenqualitaet -- reparieren --probelauf --projekt <…>               [--url <adresse>] [--liste <datei>]
npm run datenqualitaet -- reparieren             --projekt <…> --vorstand <Profil-ID> [--url <adresse>]
```

- `--projekt prod|test` ohne `--url`: Supabase Cloud. Eigener Server: `--projekt prod --url <adresse>` (oder
  `ICR_SUPABASE_URL`). Lokaler Stack: `--projekt lokal --url http://127.0.0.1:<port>` (nur localhost).
- Reihenfolge: lokal bzw. Test-Projekt, dann Produktion.

## Was geprüft und geändert wird

- **Betroffen** sind aktive Profile inklusive Vorstand und Alumni. Gekündigte Profile und offene Anträge werden
  nur gezählt, nie geändert. Bei Alumni sind IBAN und BIC nie ein Mangel.
- **`pruefen`**: Zählungen je Feld und Mängel-Code, die Hinweise (`vorwahl_ergaenzt`, `bic_land`), Profile ohne
  `member_secrets`-Zeile und nicht lesbare Zeilen.
- **`reparieren --probelauf`**: je Feld, wie viele Profile `gueltig`, `sicher` (wird automatisch korrigiert),
  `vorschlag` (bestätigt das Mitglied in der Abfrage) oder `offen` (Mitglied oder Vorstand korrigiert) sind.
- **`reparieren`** schreibt **nur „sicher“**:
  - Handy mit deutschem Beleg (führende 0, `0049`, `+49 0`) → E.164,
  - Straße mit Hausnummer bei leerer Hausnummer → abgetrennt,
  - BIC mit falschem Format → geleert (BIC ist optional).

  Vorschläge (z. B. Handy ohne Vorwahl und ohne 0) und alles andere bleiben unangetastet, auch die IBAN.
  Vorher gibt das Skript den Probelauf aus und verlangt „REPARIEREN <projekt-ref bzw. adresse>“.
  Geschrieben wird je Profil über `saveMemberSecrets` mit dem gerade geprüften Stand: Hat sich die Zeile
  inzwischen geändert (Versionskonflikt), wird das Profil übersprungen und gezählt, nicht wiederholt. Jede
  Änderung steht mit `--vorstand` (aktives Profil mit Rolle `board`) und den Feldnamen in
  `member_data_corrections`. Ein zweiter Lauf ändert 0 Profile.

## Ausgabe und Liste

Die Ausgabe enthält nur Zahlen, Feldnamen und Codes, nie Werte, Namen, E-Mails oder Profil-IDs, auch nicht bei
Fehlern (dann nur Fehlerklasse und Code-Stellen). Wer die betroffenen Profile braucht, gibt ausdrücklich
`--liste <datei>` an (nur bei `pruefen` und beim Probelauf): eine TSV mit Profil-ID, Gruppe, Zeile vorhanden,
Mängeln (`feld:code`), Hinweisen und Feldnamen der Vorschläge bzw. automatischen Korrekturen, ohne Werte. Die
Datei muss außerhalb des Repos liegen (das Repo ist öffentlich) und gehört nach der Arbeit gelöscht.

## Land der Anschrift

Solange `land` noch kein gespeichertes Feld ist, gilt beim Prüfen Deutschland. Die gelesenen Felder stehen in
`GESPEICHERTE_FELDER` (`scripts/lib/datenqualitaet.mjs`); kommt `land` hinzu, wird es dort ergänzt.
