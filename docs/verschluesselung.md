# Verschlüsselung der Mitgliedsdaten

Stand: 21.10.2026. In der Produktion abgeschlossen: seit 21.10.2026 ist der Klartext geleert und der Endzustand gesetzt. Die Übergangslogik ist mit Migration `20261021120000_member_plaintext_cleanup.sql` entfernt (siehe „Aufräumen nach dem Abschluss“ am Ende). Die Abschnitte zu Phase 2 und 3 beschreiben den Weg dorthin.

## Ziel und Schutzumfang

Verschlüsselt werden IBAN, BIC, Geburtsdatum, Straße, Hausnummer, PLZ, Ort und Handynummer. Name und
E-Mail bleiben lesbar, weil Login, Suche und Mails sie brauchen.

| Schützt gegen | Schützt nicht gegen |
|---|---|
| geleakte Supabase-Backups und Dumps | Zugriff auf Vercel bzw. dessen Umgebungsvariablen (dort liegt der Master Key) oder auf den Rechner, auf dem das Skript `scripts/verschluesselung.mjs` gerade läuft |
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
  - Korrekturen macht der Vorstand ab Phase 2b im Intranet (siehe unten), auch beim Geburtsdatum.
  - **Notfall-Korrektur durch den Vorstand, gilt nur bis Phase 3:**
    1. `delete from public.member_secrets where profile_id = '<id>';`. Das ist sicher, weil der Klartext
       garantiert identisch ist.
    2. Dann den Klartext korrigieren. Beim nächsten Speichern im Profil entsteht die Zeile neu.
  - **Nie** `app.member_secrets_write` von Hand setzen. Dann wäre die verschlüsselte Fassung veraltet, und
    die Korrektur ginge beim nächsten Speichern verloren.
- **Altbestand:** Mitglieder ohne `member_secrets`-Zeile bleiben wie bisher. Eine IBAN-Änderung im
  Dashboard meldet der alte Trigger weiterhin. (Bis 21.10.2026; der Trigger ist seit dem Aufräumen gelöscht.)
- **Registrierung ohne Key:** Ist kein Master Key konfiguriert oder registriert, läuft die Registrierung
  nur mit Klartext weiter. Phase 3 verschlüsselt dann nach. Profiländerungen werden dagegen abgelehnt
  (fail closed). (Bis 21.10.2026; seitdem wird die Registrierung ohne Key abgewiesen.)

### Rollout in die Produktion (Reihenfolge)

0. **Probelauf im Test-Projekt:** Test-Key registrieren und den ganzen Ablauf durchspielen:
   - Registrieren und bestätigen
   - zweimal speichern
   - IBAN wechseln: genau ein Event
   - Änderung im Dashboard: wird abgewiesen
1. **Prod-Master-Key erzeugen**, auf einem vertrauenswürdigen Rechner: Key und Prüfwert
   (`scripts/key-check-value.mjs` mit dem frisch erzeugten Key) **zusammen** offline hinterlegen und die
   Wiederherstellungsprobe machen. Danach liegt der Key nur noch in der Hinterlegung und in Vercel, nicht
   gespeichert auf einem Laptop. Für die Schritte 6 bis 9 wird er einmalig in das Skript eingegeben (verdeckte
   Abfrage, nicht in Dateien, Umgebungsvariablen oder der Shell-History; nur auf einem vertrauenswürdigen
   Rechner).
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
Die Schritte 6 bis 9 laufen über das Skript `scripts/verschluesselung.mjs` (nicht im Intranet, damit dort
niemand Klartext leeren kann), im Ordner `web`:

```
npm run verschluesselung -- <pruefen|verschluesseln|leeren|abschliessen> --projekt <prod|test>
```

Es fragt Service-Role-Key, Master Key und Key-ID verdeckt ab (oder liest sie aus der Umgebung), speichert
nichts und bricht ab, wenn der Key nicht zum registrierten Prüfwert passt. „leeren“ und „abschliessen“
verlangen die Eingabe von „LEEREN <projekt-ref>“ bzw. „ABSCHLIESSEN <projekt-ref>“.

6. **IBAN-Problemfälle korrigieren:** `pruefen` listet sie; je Profil über Verwaltung → Mitglieder → Stift
   die richtige IBAN eintragen (Stand 12.10.2026: 3 Fälle). Konten mit Konto-Metadaten bereinigen (siehe unten).
7. **Backfill:** `verschluesseln`, danach `pruefen`, bis der Status „bereit zum Leeren“ meldet (0 ohne
   Verschlüsselung, keine IBAN-Fälle, nichts unlesbar, keine Abweichungen). Konto-Metadaten und offene
   Registrierungen mit Klartext blockieren erst das Abschließen; „nicht übernommen“ ist nur ein Hinweis.
8. **Frischen Dump ziehen** (`pg_dump`, Free-Plan ohne Dashboard-Backups), Hinterlegung des Keys prüfen.
9. **`leeren`**, dann **`abschliessen`**. Danach einmal `pruefen`: 0 mit Klartext, Abgeschlossen gesetzt.

**Instant Rollback in Vercel:** Die alte App schreibt `profiles` direkt. Bei Mitgliedern mit
`member_secrets`-Zeile weist der Datenbank-Schutz das ab, Profiländerungen schlagen dann fehl. Das ist
gewollt (fail closed).

## Phase 2b: Was gilt

- **Lesen:** Finanzexport, BVH-Export und Mitgliedertabelle lesen über `readMemberSecretsMany`:
  - Mitglied mit `member_secrets`-Zeile: nur die Zeile, nie der Klartext.
  - Mitglied ohne Zeile: Klartext (Übergangsphase bis zum Backfill; seit dem Aufräumen: alle Felder leer).
  - Nicht entschlüsselbare Zeile: Finanzexport und BVH-Export brechen mit Meldung ab (sonst fehlten
    Mitglieder still im Einzug), auch wenn das betroffene Mitglied gar nicht eingezogen würde. Bewusst
    streng: Eine solche Zeile bedeutet falscher Key oder Manipulation. Die Mitgliedertabelle zeigt
    „nicht lesbar“.
- **Korrektur durch den Vorstand:** Verwaltung → Mitglieder → Stift-Symbol (nur Rolle `board`).
  - Straße, Hausnummer, PLZ, Ort, Handynummer, Geburtsdatum, BIC; die IBAN wird nur gekürzt angezeigt und
    durch Neueingabe ersetzt.
  - Gleiche Prüfregeln wie Profil und Registrierung, aber nur für geänderte Felder. Gespeichert werden nur
    Felder, die gegenüber dem Stand beim Öffnen geändert wurden; hat sich ein solches Feld inzwischen in der
    Datenbank geändert (z. B. durch das Mitglied), bricht die Korrektur ab. Das Geburtsdatum lässt sich nicht
    löschen.
  - Umgekehrt speichert das Profilformular nur die Felder des bearbeiteten Abschnitts (Persönliche Daten
    oder Bankverbindung).
  - Speichern über `save_member_secrets` mit `p_corrected_by`: Eintrag in `member_data_corrections` (wer,
    wann, welche Felder, nie Werte). Eine neue IBAN erzeugt das übliche IBAN-Event mit `by_board = true`;
    die Vorstandsmail nennt dann die Korrektur durch den Vorstand.
  - Das Geburtsdatum wird jetzt ebenfalls in den Klartext mitgeschrieben, damit beide Fassungen bis Phase 3
    gleich bleiben. (Bis 21.10.2026; seit dem Aufräumen gibt es keinen Dual Write mehr.)
- **Finanzexport im Browser:** Die Vorschau zeigt nur gekürzte IBANs. Vollständige IBANs gehen nur beim
  Download an den Browser und jeder solche Abruf steht in `finance_exports`. CSV und XML weiter im Browser
  zu erzeugen ist eine bewusste Entscheidung: Die Datei landet ohnehin beim Vorstand, ein serverseitiger
  Aufbau brächte keinen zusätzlichen Schutz.
- **Release:** Die Migration `20261013100000_member_secrets_board_correction.sql` ersetzt
  `save_member_secrets` (`drop function`; die CI wertet `drop function` nicht als destruktiv). Die App sendet
  `p_corrected_by` nur bei Korrekturen; Profiländerungen funktionieren also auch, falls die App kurz vor der
  Migration live geht. Korrekturen erst nach der Migration.

## Phase 3: Bestandsdaten umstellen (umgesetzt)

1. **Backfill** (umgesetzt, `npm run verschluesselung -- verschluesseln`, `lib/member-secrets-backfill.ts`):
   - Läuft per Skript auf dem Rechner des IT-Vorstands (Key einmalig verdeckt eingegeben). Portionen zu 25 Profilen ab dem zuletzt
     bearbeiteten (Cursor), bis keines übrig ist. Mehrfach ausführbar.
   - Pro Mitglied: Zeile aus dem Klartext anlegen (`saveMemberSecrets` ohne Änderungen – schreibt keinen
     Klartext, kein IBAN-Event), zurücklesen, entschlüsseln, mit dem frisch gelesenen Klartext vergleichen.
   - Abweichung: Die neue Zeile (Version 1) wird wieder gelöscht, der Klartext bleibt maßgeblich.
   - Übersprungen und aufgelistet (nur Profil-IDs): IBAN mit verlustbehaftetem Format (Freitext, Bindestriche,
     keine IBAN-Form – vorher im Mitglied korrigieren) und Profile mit offener Registrierung.
   - Alle Abfragen seitenweise mit Gesamtzahl-Abgleich (PostgREST liefert sonst still höchstens 1000 Zeilen).
2. **Prüflauf** (umgesetzt, `npm run verschluesselung -- pruefen`, ändert nichts): alle Zeilen entschlüsseln und feldweise mit
   dem Klartext vergleichen (leer = leer, IBAN normalisiert), dazu IBAN-Fingerabdruck, letzte 4 Stellen und
   registrierten, nicht zurückgezogenen Key. Bereit erst bei 0 ohne Verschlüsselung und leeren Listen
   (nicht lesbar, Abweichungen, IBAN prüfen).
   - „Bereit“ gilt nur für den Zeitpunkt der Prüfung. Das Leeren (Phase 3b) prüft jedes Profil selbst noch
     einmal und leert nie ein Profil ohne Zeile.
   - Test-Projekt: 1174 Profile (über der 1000er-Grenze), gemischte Formate, 3 IBAN-Problemfälle, ein
     entfernter Fingerabdruck – alles erkannt; Klartext unverändert, keine Events.
   - Prod (12.10.2026, nur Zählung): 446 Profile, 390 mit IBAN, 3 IBANs mit Format zum Prüfen.
3. **Vor dem Leeren der Klartextspalten:**
   - `pruefen` meldet „bereit zum Leeren“ (inkl. Fingerabdruck und Key).
   - Die Hinterlegung des Keys samt Prüfwert ist geprüft.
   - Ein frischer Dump ist gezogen (`pg_dump` über den Session-Pooler; der Free-Plan hat keine Dashboard-Backups).
4. **Klartext leeren** (umgesetzt, Phase 3b, Migration `20261014100000_member_plaintext_clearing.sql`):
   - `npm run verschluesselung -- leeren` (nur ohne Befunde, Bestätigung durch Eingabe). Je Profil frisch geprüft
     (Zeile lesbar, gleich dem Klartext, Fingerabdruck, Key, IBAN-Format), dann `clear_member_plaintext`:
     leert nur mit vorhandener Zeile und nur, wenn der Klartext noch exakt dem geprüften Stand entspricht.
     Setzt `member_secrets.plain_cleared_at` und entfernt die Klartext-Kopie aus übernommenen
     `pending_registrations`.
   - Bis zum Abschließen gilt für noch nicht geleerte Profile weiter der Dual Write; ein bereits geleertes
     Profil bekommt keinen Klartext mehr. Profile mit offener Registrierung werden übersprungen.
   - Offene Registrierungen werden nur gelöscht, wenn genau ihre Chiffrate übernommen wurden (gleicher
     Datenschlüssel, eigenes Profil). Verknüpfte Altprofile (id ≠ user_id) bleiben liegen – deren Chiffrate
     sind die einzige Kopie; der Prüflauf zeigt sie als „Registrierung nicht übernommen“.
   - **Konto-Metadaten:** Ältere Konten können sensible Registrierungsangaben noch in
     `auth.users.raw_user_meta_data` tragen (Prod 12.10.2026: 2). Sie blockieren „Abschließen“. Vorgehen je
     Konto im SQL-Editor:
     1. Nur die Schlüssel ansehen: `select id, array(select k from jsonb_object_keys(raw_user_meta_data) k
        where k in ('IBAN','BIC','Geburtsdatum','Straße','Hausnr','PLZ','Ort','Handynummer')) from auth.users
        where raw_user_meta_data ?| array['IBAN','BIC','Geburtsdatum','Straße','Hausnr','PLZ','Ort','Handynummer'];`
     2. Werte mit den Daten des Mitglieds vergleichen (Korrekturdialog); fehlt dort etwas, über den Dialog
        nachtragen.
     3. Dann entfernen: `update auth.users set raw_user_meta_data = raw_user_meta_data - array['IBAN','BIC',
        'Geburtsdatum','Straße','Hausnr','PLZ','Ort','Handynummer'] where id = '<id>';`
   - **Deploy-Reihenfolge:** Migration vor der App (beim Release-Merge läuft die Migration über die
     Integration). Läuft die neue App kurz ohne Migration, schlagen nur Prüflauf und Leeren fehl.
   - **„Abschließen“** (`finish_plain_clearing`): nur wenn kein Profil mehr sensiblen Klartext hat und keine
     offene Registrierung nur Klartext trägt (sperrt dazu `profiles` kurz gegen Schreibvorgänge). Setzt
     `member_crypto_state.plain_cleared_at`. Ab dann:
     - `save_member_secrets` schreibt keinen Klartext mehr (auch nicht für ein zurückgerolltes altes Deployment),
     - Registrierung: Profil ohne sensible Klartextwerte, `pending_registrations` nur mit Chiffraten
       (sensible Schlüssel werden entfernt; ohne Chiffrate wird die Registrierung abgewiesen),
     - `profiles_block_sensitive_plain` weist jeden neuen sensiblen Klartextwert ab (App, Dashboard, SQL).
   - Mail „Neues Mitglied“ enthält keinen Ort mehr; gespeicherte Payloads werden bereinigt.
   - Zurück (nur im Notfall): siehe „Aufräumen nach dem Abschluss“ → Notfall-Weg.
   - Im Test-Projekt geprüft: 68 Profile geleert, Chiffrate byte-gleich vor/nach dem Leeren, 0 Profile mit
     Klartext, Klartext-Update/-Insert abgewiesen, Registrierung ohne Chiffrate abgewiesen, mit Chiffraten ohne
     sensible Schlüssel abgelegt, Profil speichern, Korrektur und Finanzexport im Endzustand ohne Klartext.
   - Die Migration läuft mit dem Label `destructive-ok`.
5. **Altlasten:** `raw_user_meta_data` und verwaiste `pending_registrations` bereinigen.
   - Offene `pending_registrations`: `registration_meta_is_redundant` vergleicht mit dem Klartext. Nach einer
     Korrektur (oder nach dem Leeren) bleiben solche Einträge liegen und müssen gezielt bereinigt werden.
   - Erledigt mit 3b: Mail „Neues Mitglied“ ohne Ort.
   - Aufgeräumt am 21.10.2026 (siehe unten). Die leeren Klartextspalten bleiben vorerst.
6. **Recht auf Löschung:**
   - Die ganze `member_secrets`-Zeile löschen, nicht nur den Datenschlüssel, und die zugehörigen
     Events bereinigen.
   - Die Aufbewahrungsfrist der Backups im Verzeichnis der Verarbeitungstätigkeiten dokumentieren.

## Aufräumen nach dem Abschluss (21.10.2026)

Phase C lief in der Produktion am 21.10.2026 (414 Profile verschlüsselt und geleert, Endzustand gesetzt).
Danach entfernt (App und Migration `20261021120000_member_plaintext_cleanup.sql`, ein PR):

- **Leser:** Profilseite, Mitgliedertabelle, Korrekturdialog, Finanzexport und BVH-CSV laden keine
  Klartextspalten mehr. Ohne `member_secrets`-Zeile sind alle sensiblen Felder leer (`emptySecretValues`).
- **Speichern:** `saveMemberSecrets` liest keinen Klartext mehr; ohne Zeile beginnt es mit leeren Feldern.
  `save_member_secrets` schreibt keinen Klartext mehr. `p_plain` trägt nur noch die Namen der geänderten Felder
  (Korrekturprotokoll), Werte werden ignoriert; die Signatur ist unverändert. `iban_changed_at` setzt die
  Funktion nur noch bei einer IBAN-Änderung.
- **Trigger:** `profiles_track_iban_change` und `profiles_guard_sensitive_plain` sind gelöscht.
- **Registrierung:** Die App schickt sensible Angaben nur verschlüsselt; ohne registrierten Key wird die
  Registrierung immer abgewiesen. `provision_profile_for_auth_user` und `handle_pending_registration` setzen
  keine sensiblen Spalten mehr. `registration_meta_is_redundant` vergleicht nur noch nicht sensible Felder.
  `finish_pending_registration` kennt keine Registrierungen nur mit Klartext mehr.
- **Konto-Metadaten:** `strip_registration_meta` entfernt sensible Angaben immer, jetzt auch beim Anlegen des
  Kontos (Trigger `before insert or update` auf `auth.users`). Vorher blieben sie im Endzustand liegen.

Bleibt:
- die leeren Klartextspalten in `profiles` mit `profiles_block_sensitive_plain` (weist neuen Klartext ab),
- `member_crypto_state` / `member_plain_cleared()` (frische Datenbanken wie CI und `seed.sql` starten im
  Übergangszustand),
- das Skript `scripts/verschluesselung.mjs`; `pruefen` funktioniert wie bisher.

**Notfall-Weg (Master Key verloren, Klartext aus dem Backup):** ohne Code-Revert möglich (abgeleitet aus dem
Code, nicht durchgespielt).
1. `update public.member_crypto_state set plain_cleared_at = null;` (Sperre aus; bis `abschliessen` lässt
   die Datenbank wieder Klartext zu, auch über das Dashboard).
2. Die nicht mehr lesbaren `member_secrets`-Zeilen löschen und den Klartext aus dem Dump vor dem Leeren
   zurückspielen. Änderungen und Neuanmeldungen seit diesem Dump sind verloren (ihre Zeilen waren mit dem
   verlorenen Key verschlüsselt); diese Mitglieder müssen ihre Angaben neu eintragen.
3. Neuen Key erzeugen, hinterlegen, in Vercel setzen und den Prüfwert registrieren.
4. `verschluesseln` (übergibt den Klartext ausdrücklich an `saveMemberSecrets`; Profile mit offener
   Registrierung überspringt es), `pruefen`, frischer Dump, `leeren`, `abschliessen`.

Bis Schritt 4 durch ist, zeigt das Intranet die sensiblen Felder leer (kein Klartext-Rückgriff mehr).

**Datenbanken im Übergangszustand** (frische Datenbank, CI, `seed.sql`): Dort pflegt nach dem Aufräumen
niemand mehr den Klartext. `pruefen` meldet für Mitglieder, die danach speichern, Abweichungen. Für die
Produktion und das Test-Projekt (beide im Endzustand) ohne Bedeutung.
