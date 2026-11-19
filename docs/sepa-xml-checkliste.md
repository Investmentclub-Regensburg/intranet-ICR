# SEPA XML Checkliste (Sparkassen-/Banking-kompatibel)

Diese Checkliste ist bewusst konservativ gehalten, damit Exporte auch bei strengen Bank-Validatoren akzeptiert werden.

## 1) IDs und Referenzen

- `MsgId` und `PmtInfId`
  - nur `A-Z` und `0-9`
  - keine Leerzeichen, keine Sonderzeichen
  - maximal 35 Zeichen
- `EndToEndId`
  - nur `A-Z` und `0-9`
  - maximal 35 Zeichen
  - pro Transaktion eindeutig
- `MndtId` (Mandatsreferenz)
  - nur `A-Z` und `0-9`
  - keine Bindestriche
  - maximal 35 Zeichen
  - stabil und eindeutig je Mandat

## 2) Namen und Textfelder

- Namen (`Dbtr/Nm`) vor Export normalisieren
  - Umlaute transliterieren (`ä -> ae`, `ö -> oe`, `ü -> ue`, `ß -> ss`)
  - keine Bindestriche (bankseitige Sonderregel)
  - keine XML-Sonderzeichen unescaped (`& < > " '`)
- Kreditorname (`InitgPty/Nm`, `Cdtr/Nm`) ebenfalls XML-escaped ausgeben.

## 3) Bankdaten

- Debitor-IBAN
  - Pflichtfeld
  - vorab auf Format + Prüfsumme validieren
- Debitor-BIC
  - EWR-IBAN: nie eine BIC, immer `DbtrAgt/FinInstnId/Othr/Id` = `NOTPROVIDED` (EPC130-08 v7.0, Index 2.70;
    `debitorBic` in `lib/finance-category.ts`). Die BIC wird seit 20.11.2026 nicht mehr abgefragt.
  - IBAN außerhalb des EWR (CH, GB, …): kommt derzeit nicht in die Datei (Vorschau „Konto außerhalb des EWR –
    manuell“), bis der Export Anschrift (`PstlAdr`) und BIC für diese Konten liefert.
- Kreditordaten (`CdtrAcct/IBAN`, `CdtrAgt/BIC`, `CdtrSchmeId`)
  - vollständig und korrekt hinterlegt

## 4) Beträge und Summen

- `InstdAmt` pro Transaktion mit Punkt als Dezimaltrennzeichen (z. B. `15.00`)
- `CtrlSum` muss exakt der Summe aller `InstdAmt` entsprechen
- `NbOfTxs` muss exakt der Anzahl der `DrctDbtTxInf` entsprechen

## 5) Datumsfelder

- `ReqdColltnDt` im Format `YYYY-MM-DD`
- `DtOfSgntr` (Mandatsdatum) im Format `YYYY-MM-DD`
- keine ungültigen oder leeren Datumswerte exportieren

## 6) XML-Struktur und Encoding

- `UTF-8` Encoding verwenden
- Namespace korrekt setzen (`pain.008.001.02`)
- dynamische Inhalte immer XML-escapen
- vor Nutzung in Banking-App einmal gegen XSD/Bankvalidator prüfen

## 7) Operative Freigabe vor Upload

- 1 Testdatei mit 1-2 Datensätzen in Banking-App importieren
- anschließend Voll-Export testen
- bei Fehler: problematische Transaktion isolieren (ID/Name/Datum/BIC/IBAN prüfen)
