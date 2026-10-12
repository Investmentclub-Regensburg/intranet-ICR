# Verschlüsselung der Mitgliedsdaten

Stand: 12.10.2026. Phase 0 und 1 sind umgesetzt, Phase 2a ist in Arbeit (Datenbank, Profil, Registrierung), Phase 2b und 3 sind geplant.

## Ziel und Schutzumfang

Verschlüsselt werden IBAN, BIC, Geburtsdatum, Straße, Hausnummer, PLZ, Ort und Handynummer. Name und
E-Mail bleiben lesbar, weil Login, Suche und Mails sie brauchen.

| Schützt gegen | Schützt nicht gegen |
|---|---|
| geleakte Supabase-Backups und Dumps | Zugriff auf Vercel bzw. dessen Umgebungsvariablen (dort liegt der Master Key) |
| SQL- oder Dashboard-Zugriff ohne Vercel-Zugang | Logikfehler in Server-Actions, die entschlüsseln |
| geleakten `service_role`-Key, SQL-Injection | übernommene Admin- oder Vorstandskonten, XSS auf Admin-Seiten |
| Mitglieder, die per API ihre Profilzeile lesen | Logs und Mails (letzte 4 Stellen der IBAN) |

## Verfahren (Phase 1, `lib/member-crypto.ts`)

- **Master Key:**
  - Umgebungsvariable `MEMBER_DATA_MASTER_KEY` (Base64, 32 Byte) plus `MEMBER_DATA_MASTER_KEY_ID`.
  - Test-Projekt und Produktion haben **verschiedene** Keys.
  - Ältere Keys für eine Rotation stehen in `MEMBER_DATA_OLD_MASTER_KEYS` im Format `id:base64,…`.
- **Abgeleitete Schlüssel:** Per HKDF-SHA256 entstehen aus dem Master Key drei getrennte Schlüssel:
  - der KEK (verschlüsselt die Datenschlüssel),
  - der Index-Key (für Fingerabdrücke),
  - der Prüfwert (KCV).
- **Datenschlüssel (DEK):** Jedes Mitglied hat einen eigenen DEK.
  - Er ist mit AES-256-GCM verschlüsselt, gebunden an das Mitglied und die Master-Key-ID.
  - Format: `w2.<keyId>.<kcv>.<…>`.
- **Felder:** AES-256-GCM, gebunden an Mitglied und Feldname. Format: `e1.<…>`.
- **Fingerabdruck:**
  - HMAC-SHA256, Format: `h1.<keyId>.<hex>`.
  - Wozu: IBAN-Änderungen erkennen, ohne dass die Datenbank die IBAN kennt.
  - Vergleich nur über `blindIndexChanged`: Erste Hinterlegung und Neuberechnung nach einer Rotation
    sind **keine** Änderung.
- **Prüfwert (KCV):** Ein falscher Key unter einer bekannten ID fällt sofort auf. Die App darf nur mit
  Keys verschlüsseln, deren Prüfwert in der Datenbank registriert ist (Phase 2).
- **Tests:** `tests/member-crypto.test.mjs` enthält feste Testvektoren. Ändert jemand das Format
  versehentlich, schlägt der Test fehl.

## Master Key: Erzeugen, Hinterlegen, Verlust

- **Erzeugen:** `node scripts/generate-master-key.mjs`, nur im eigenen Terminal. Den Key nie
  committen, nie in Chats oder Tickets kopieren.
- **Verlust:** **Ist der Key verloren, sind die Daten verloren.** Deshalb gilt vor der ersten echten
  Verschlüsselung:
  - Den Prod-Key offline an mindestens zwei getrennten Stellen hinterlegen (z. B. Passwortmanager
    zweier Vorstände plus versiegeltes Papier), zusammen mit Key-ID und Prüfwert.
  - Eine Wiederherstellungsprobe machen: Mit dem hinterlegten Key eine Stichprobe entschlüsseln.
  - Bei jedem Vorstandswechsel die Hinterlegung prüfen.
- **Rotation:**
  1. Neue Key-ID und deren Prüfwert in der Datenbank registrieren (Migration oder Admin-Schritt).
     Erst danach die Umgebungsvariablen umstellen, sonst blockiert die Prüfung jede Verschlüsselung.
  2. Den neuen Key mit der neuen ID setzen und den alten nach `MEMBER_DATA_OLD_MASTER_KEYS`
     verschieben.
  3. Die Datenschlüssel neu verschlüsseln (`rewrapDataKey`, Bedingung `wrapped_dek = alt` bzw.
     `version`). Die Fingerabdrücke im selben Schritt neu berechnen, dafür braucht es die entschlüsselte
     IBAN.
  4. Erst danach den alten Key entfernen.
  5. Eine Key-ID **nie** für einen anderen Key wiederverwenden.
     - Stehen beide Keys gleichzeitig unter derselben ID in der Konfiguration, startet die
       Verschlüsselung nicht.
     - Wird der alte Key nur ersetzt, startet die App zwar. Der falsche Key fällt dann aber über den
       Prüfwert auf: beim Entschlüsseln und bei der Pflichtprüfung vor dem Verschlüsseln.
- **Umgebungen:** Vercel Preview und Development bekommen **nie** den Prod-Key. Die Tabelle der
  registrierten Keys bindet einen Key an eine bestimmte Datenbank.

## Regeln für den Code

- Datenschlüssel nur über `withDataKey` (synchron) bzw. `withDataKeyAsync` (async) verwenden. Danach
  wird der Schlüssel überschrieben. `withDataKey` lehnt async-Callbacks ab.
- IBAN immer über `normalizeIban`, `ibanIndex` und `ibanChanged` behandeln, nie eigene Normalisierung.
  Reihenfolge: erst normalisieren, dann genau diesen String validieren und speichern.
- `ibanChanged` wirft, wenn der Master Key des alten Fingerabdrucks fehlt (Rotationsreihenfolge
  verletzt) oder der gespeicherte Fingerabdruck beschädigt ist. Dann wird das Speichern blockiert, statt
  eine Änderung zu verpassen oder fälschlich zu melden.
- Ist die Pflichtprüfung der registrierten Keys nicht möglich, etwa weil die Datenbank nicht erreichbar
  ist, wird **nicht** verschlüsselt (fail closed).
- `lib/member-crypto*` nie aus `middleware.ts` oder Edge-Code importieren.

## Phase 2: Umbau (geplant, Pflichtpunkte aus der Gegenprüfung)

1. **Tabelle `member_secrets`:**
   - Spalten: `profile_id` (PK), `wrapped_dek`, die 8 Felder als `e1`, `iban_hash` (`h1`),
     `iban_last4`, `version` und `updated_at`.
   - RLS ist an, es gibt keine Policies und keine Rechte für anon oder authenticated.
   - Der Datenschlüssel ist per Trigger unveränderlich, außer bei einem Rewrap (Bedingung
     `wrapped_dek = alt`).
   - Gespeichert wird nach dem Muster „anlegen oder vorhandene lesen“ (`ON CONFLICT DO NOTHING`)
     mit optimistischer Sperre über `version`. So entstehen nie gemischte Datenschlüssel in einer
     Zeile.
2. **Tabelle der registrierten Master Keys** (`key_id`, `kcv`):
   - Einträge entstehen nur per Migration oder durch einen Admin-Schritt.
   - Die App prüft vor dem ersten Verschlüsseln den Prüfwert. Gibt es keinen Treffer, bricht sie ab
     und verschlüsselt nichts.
3. **IBAN-Änderung:**
   - Den Trigger `profiles_track_iban_change` entschärfen, **bevor** Klartext geleert wird. Sonst
     zählt jedes Leeren als IBAN-Änderung, und der SEPA-Export markiert alle Mandate als geändert.
   - Ob sich die IBAN geändert hat, entscheidet die **App** mit `ibanChanged`. Sie erkennt Änderungen
     auch während einer Rotation; ein DB-Trigger kann das bei verschiedenen Key-IDs nicht.
   - Die App übergibt das Ergebnis an die Speicherfunktion (RPC). Diese setzt `iban_changed_at` und
     erzeugt das Event mit den letzten 4 Stellen.
   - Erste Hinterlegung zählt nicht als Änderung.
   - **Entscheidung:** Eine gelöschte IBAN ist ebenfalls keine Mandatsänderung. Das Mitglied fällt
     dann ohnehin aus dem Einzug (`no_iban`). Der bisherige Trigger hat das noch gezählt.
4. **Registrierung:**
   - Die App verschlüsselt beim Absenden (DEK für `user.id`) und legt die Chiffrate in
     `pending_registrations` ab.
   - Der Trigger kopiert bei der Bestätigung den **ganzen** Satz (DEK und alle Felder) oder gar
     nichts. Er entschlüsselt nie.
   - Wird ein älteres Profil verknüpft (andere ID), bleibt der Eintrag liegen und wird über
     `rebindSecrets` übernommen (Punkt 6).
   - Den Klartext-Rückfall nach `user_metadata` entfernen.
   - `registration_meta_is_redundant` und `strip_registration_meta` auf die neue Logik umstellen.
5. **Lesen:** Gibt es eine `member_secrets`-Zeile, wird **nie** auf den Klartext zurückgegriffen.
6. **Verknüpfen oder Zusammenführen von Profilen** (auch liegengebliebene Registrierungen aus Punkt 4):
   - Werte per App entschlüsseln und für das Zielprofil neu verschlüsseln (`rebindSecrets`).
   - `profiles.id` wird nie geändert.
7. **Finanzexport:** CSV und XML serverseitig erzeugen und protokollieren, statt alle IBANs an den
   Browser zu schicken.
8. **Mail „Neues Mitglied“:** Der Ort fehlt dann in der Payload, die App liefert ihn nach.
9. **`utils/supabase/cached-auth.ts`:** feste Spaltenliste statt `select("*")`.

## Phase 2a: Was gilt (umgesetzt)

- **Dual Write:** `member_secrets` ist die maßgebliche Fassung. Die Klartextspalten in `profiles` werden
  bis Phase 3 mitgeschrieben, damit Finanzexport, BVH-Export und Admin-Tabelle bis Phase 2b weiter
  funktionieren.
- **Sperre im Dashboard:** Bei Mitgliedern mit `member_secrets`-Zeile lassen sich IBAN, BIC,
  Geburtsdatum, Straße, Hausnummer, PLZ, Ort und Handynummer **nicht mehr im Supabase-Dashboard oder per
  SQL ändern**, nur noch über das Intranet. Sonst wäre die verschlüsselte Fassung veraltet und würde beim
  nächsten Speichern die Korrektur überschreiben.
  - **Offen:** Das Geburtsdatum kann im Intranet niemand ändern. Eine Korrekturmöglichkeit für den
    Vorstand kommt mit Phase 2b.
  - **Notfall-Korrektur durch den Vorstand, gilt nur bis Phase 3:**
    1. `delete from public.member_secrets where profile_id = '<id>';`. Das ist sicher, weil der Klartext
       garantiert identisch ist.
    2. Dann den Klartext korrigieren. Beim nächsten Speichern im Profil entsteht die Zeile neu.
  - **Nie** `app.member_secrets_write` von Hand setzen. Dann wäre die verschlüsselte Fassung veraltet, und
    die Korrektur ginge beim nächsten Speichern verloren.
- **Altbestand:** Mitglieder ohne `member_secrets`-Zeile bleiben wie bisher. Eine IBAN-Änderung im
  Dashboard meldet der alte Trigger weiterhin.
- **Registrierung ohne Key:** Ist kein Master Key konfiguriert oder registriert, läuft die Registrierung
  nur mit Klartext weiter. Phase 3 verschlüsselt dann nach. Profiländerungen werden dagegen abgelehnt
  (fail closed).

### Rollout in die Produktion (Reihenfolge)

0. **Probelauf im Test-Projekt:** Test-Key registrieren und den ganzen Ablauf durchspielen:
   - Registrieren und bestätigen
   - zweimal speichern
   - IBAN wechseln: genau ein Event
   - Änderung im Dashboard: wird abgewiesen
1. **Prod-Master-Key erzeugen**, auf einem vertrauenswürdigen Rechner: Key und Prüfwert
   (`scripts/key-check-value.mjs` mit dem frisch erzeugten Key) **zusammen** offline hinterlegen und die
   Wiederherstellungsprobe machen. Danach liegt der Key nur noch in der Hinterlegung und in Vercel, nicht
   auf einem Laptop.
2. **Vercel:** In Vercel nur für **Production** `MEMBER_DATA_MASTER_KEY` und `MEMBER_DATA_MASTER_KEY_ID`
   setzen. Prüfen, dass Preview und Development den Key **nicht** haben.
3. **Release-PR mergen**, mit dem Label `destructive-ok` (Treffer `delete from` in
   `finish_pending_registration`). Die Migration läuft über die Supabase-Integration.
4. **Den hinterlegten Prüfwert registrieren:** `insert into public.member_crypto_keys (key_id, kcv) …` im
   SQL-Editor.
   - Bis dahin schlagen Profiländerungen fehl, und Registrierungen laufen nur mit Klartext.
   - Die Schritte 3 und 4 deshalb direkt nacheinander ausführen.
5. **Testen:** Profil eines Testkontos speichern. Erwartet wird eine `member_secrets`-Zeile und kein
   `iban_changed`-Event.

**Instant Rollback in Vercel:** Die alte App schreibt `profiles` direkt. Bei Mitgliedern mit
`member_secrets`-Zeile weist der Datenbank-Schutz das ab, Profiländerungen schlagen dann fehl. Das ist
gewollt (fail closed).

## Phase 3: Bestandsdaten umstellen (geplant)

1. **Backfill:**
   - Läuft über eine admin-geschützte Server-Action in der Produktion; der Key verlässt Vercel nie.
   - Pro Mitglied eine Transaktion mit `FOR UPDATE`.
   - Erst schreiben, zurücklesen und entschlüsseln, dann mit dem Klartext vergleichen.
2. **Getrennter Verifikationslauf:** Alle Zeilen entschlüsseln und feldweise vergleichen. Erwartet
   werden 0 Abweichungen. Die Zahl der Zeilen muss zur Zahl der Profile mit sensiblen Werten passen.
3. **Vor dem Leeren der Klartextspalten:**
   - Die Prüfwert-Kontrolle ist grün.
   - Die Hinterlegung des Keys ist geprüft.
   - Ein frisches Backup ist notiert.
   - Der IBAN-Trigger ist entschärft.
4. **Klartext leeren:**
   - Nur mit der Bedingung, dass die Werte noch dem gelesenen Stand entsprechen.
   - Mit gesetztem Kennzeichen `app.member_secrets_write` innerhalb einer Datenbankfunktion. Sonst blockiert
     der Schutz-Trigger, und der alte IBAN-Trigger würde das Leeren als Änderung melden.
   - Vorher muss die Korrekturfunktion für den Vorstand aus Phase 2b stehen, denn danach geht die
     Notfall-Korrektur nicht mehr.
   - Danach blockiert ein Trigger neue Klartext-Schreibvorgänge (Schutz gegen alte Deployments).
   - Die Migration läuft mit dem Label `destructive-ok`.
5. **Altlasten:** `raw_user_meta_data` und verwaiste `pending_registrations` bereinigen.
6. **Recht auf Löschung:**
   - Die ganze `member_secrets`-Zeile löschen, nicht nur den Datenschlüssel, und die zugehörigen
     Events bereinigen.
   - Die Aufbewahrungsfrist der Backups im Verzeichnis der Verarbeitungstätigkeiten dokumentieren.
