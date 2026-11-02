import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Datenschutz · ICR Intranet",
  robots: { index: false },
};

// Aufbau und allgemeine Pflichtinformationen (Abschnitt 1 und 3) wie die Datenschutzerklärung
// der Website (eRecht24). Abschnitte 2, 4, 5 und 6 beschreiben die Verarbeitung im Intranet und
// müssen bei jeder Änderung an Datenflüssen mitgezogen werden: neue Felder, neue Dienste
// (CSP in next.config.ts), neue Mails (supabase/functions/notify-board), Löschfristen (pg_cron).
export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutz">
      <h2>1. Datenschutz auf einen Blick</h2>

      <h3>Allgemeine Hinweise</h3>
      <p>
        Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert,
        wenn Sie das Intranet des Investment Club Regensburg e.V. unter myicr.investmentclubregensburg.com nutzen.
        Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können. Für unsere
        öffentliche Website gilt deren{" "}
        <a href="https://investmentclubregensburg.com/datenschutz" rel="noopener">
          eigene Datenschutzerklärung
        </a>
        .
      </p>

      <h3>Datenerfassung im Intranet</h3>
      <h4>Wer ist verantwortlich für die Datenerfassung im Intranet?</h4>
      <p>
        Die Datenverarbeitung im Intranet erfolgt durch den Investment Club Regensburg e.V. Dessen Kontaktdaten können
        Sie dem Abschnitt „Hinweis zur verantwortlichen Stelle“ in dieser Datenschutzerklärung entnehmen.
      </p>
      <h4>Wie erfassen wir Ihre Daten?</h4>
      <p>
        Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen, vor allem im Mitgliedsantrag, in
        Ihrem Profil und bei Anmeldungen zu Veranstaltungen. Andere Daten werden beim Aufruf des Intranets automatisch
        durch unsere IT-Systeme erfasst. Das sind vor allem technische Daten (z. B. IP-Adresse, Internetbrowser,
        Betriebssystem oder Uhrzeit des Seitenaufrufs).
      </p>
      <h4>Wofür nutzen wir Ihre Daten?</h4>
      <p>
        Wir nutzen Ihre Daten, um Ihre Mitgliedschaft zu verwalten, den Mitgliedsbeitrag einzuziehen, Veranstaltungen zu
        organisieren, Sie über das Vereinsleben zu informieren und das Intranet sicher zu betreiben. Wir werten Ihr
        Nutzungsverhalten nicht aus, setzen keine Analyse- oder Werbedienste ein und geben Ihre Daten nicht für Werbung
        weiter.
      </p>
      <h4>Welche Rechte haben Sie bezüglich Ihrer Daten?</h4>
      <p>
        Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und Zweck Ihrer gespeicherten
        personenbezogenen Daten zu erhalten. Sie haben außerdem ein Recht, die Berichtigung oder Löschung dieser Daten zu
        verlangen. Wenn Sie eine Einwilligung zur Datenverarbeitung erteilt haben, können Sie diese Einwilligung
        jederzeit für die Zukunft widerrufen. Außerdem haben Sie das Recht, unter bestimmten Umständen die Einschränkung
        der Verarbeitung Ihrer personenbezogenen Daten zu verlangen. Des Weiteren steht Ihnen ein Beschwerderecht bei der
        zuständigen Aufsichtsbehörde zu.
      </p>
      <p>Hierzu sowie zu weiteren Fragen zum Thema Datenschutz können Sie sich jederzeit an uns wenden.</p>

      <h2>2. Hosting und Datenbank</h2>

      <h3>Hosting bei Vercel</h3>
      <p>
        Das Intranet wird bei Vercel betrieben. Anbieter ist die Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA
        91723, USA. Die Anwendung läuft in einem Rechenzentrum in Dublin (Irland); Dateien wie Schriften, Bilder und
        Skripte liefert Vercel über ein weltweites Servernetz aus.
      </p>
      <p>
        Beim Aufruf des Intranets verarbeitet Vercel technisch notwendige Daten und speichert sie für einen begrenzten
        Zeitraum in Protokolldateien. Das sind insbesondere:
      </p>
      <ul>
        <li>IP-Adresse</li>
        <li>Datum und Uhrzeit der Anfrage</li>
        <li>aufgerufene Seite</li>
        <li>Browsertyp, Browserversion und Betriebssystem</li>
        <li>Referrer URL</li>
      </ul>
      <p>
        Eine Zusammenführung dieser Daten mit anderen Datenquellen nehmen wir nicht vor. Die Verarbeitung erfolgt auf
        Grundlage von Art. 6 Abs. 1 lit. f DSGVO; wir haben ein berechtigtes Interesse an einer sicheren, schnellen und
        fehlerfreien Bereitstellung des Intranets.
      </p>
      <p>
        Mit Vercel besteht ein Vertrag über Auftragsverarbeitung. Eine Verarbeitung in den USA ist nicht ausgeschlossen;
        Vercel ist nach dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO), zusätzlich gelten die
        EU-Standardvertragsklauseln.
      </p>

      <h3>Datenbank und Anmeldung bei Supabase</h3>
      <p>
        Die Daten des Intranets speichern wir bei Supabase: Mitglieds- und Kontodaten, Anmeldungen zu Veranstaltungen,
        Beiträge am Schwarzen Brett und Bilder zu Veranstaltungen. Supabase übernimmt außerdem die Anmeldung mit E-Mail
        und Passwort. Anbieter ist die Supabase Pte. Ltd., Singapur. Unsere Datenbank liegt in einem Rechenzentrum in
        Irland (EU). Passwörter speichert Supabase nur als nicht umkehrbaren Hashwert.
      </p>
      <p>
        Mit Supabase besteht ein Vertrag über Auftragsverarbeitung. Soweit Supabase oder seine Unterauftragnehmer von
        außerhalb der EU auf Daten zugreifen, etwa für Wartung und Support, gelten die EU-Standardvertragsklauseln
        (Art. 46 Abs. 2 lit. c DSGVO). Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung der Mitgliedschaft)
        und Art. 6 Abs. 1 lit. f DSGVO (zuverlässiger Betrieb des Intranets).
      </p>

      <h3>Verschlüsselung sensibler Angaben</h3>
      <p>
        IBAN, BIC, Geburtsdatum, Anschrift und Handynummer speichern wir zusätzlich verschlüsselt (AES-256). Der Schlüssel
        liegt nicht in der Datenbank, sondern nur in der Umgebung, in der die Anwendung läuft. Auch Supabase kann diese
        Angaben daher nicht im Klartext lesen. Entschlüsselt werden sie nur, wenn Sie Ihr Profil aufrufen oder eine
        berechtigte Person sie für die unten beschriebenen Zwecke benötigt.
      </p>

      <h2>3. Allgemeine Hinweise und Pflicht&shy;informationen</h2>

      <h3>Datenschutz</h3>
      <p>
        Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre
        personenbezogenen Daten vertraulich und entsprechend den gesetzlichen Datenschutzvorschriften sowie dieser
        Datenschutzerklärung.
      </p>
      <p>
        Wenn Sie das Intranet benutzen, werden verschiedene personenbezogene Daten erhoben. Personenbezogene Daten sind
        Daten, mit denen Sie persönlich identifiziert werden können. Die vorliegende Datenschutzerklärung erläutert,
        welche Daten wir erheben und wofür wir sie nutzen. Sie erläutert auch, wie und zu welchem Zweck das geschieht.
      </p>
      <p>
        Wir weisen darauf hin, dass die Datenübertragung im Internet (z. B. bei der Kommunikation per E-Mail)
        Sicherheitslücken aufweisen kann. Ein lückenloser Schutz der Daten vor dem Zugriff durch Dritte ist nicht
        möglich.
      </p>

      <h3>Hinweis zur verantwortlichen Stelle</h3>
      <p>Die verantwortliche Stelle für die Datenverarbeitung im Intranet ist:</p>
      <p>
        Investment Club Regensburg e.V.
        <br />
        Gertraud-Kaltenecker-Straße 40
        <br />
        93049 Regensburg
      </p>
      <p>E-Mail: info@investmentclubregensburg.com</p>
      <p>
        Verantwortliche Stelle ist die natürliche oder juristische Person, die allein oder gemeinsam mit anderen über die
        Zwecke und Mittel der Verarbeitung von personenbezogenen Daten (z. B. Namen, E-Mail-Adressen o. Ä.) entscheidet.
      </p>

      <h3>Speicherdauer</h3>
      <p>
        Soweit innerhalb dieser Datenschutzerklärung keine speziellere Speicherdauer genannt wurde, verbleiben Ihre
        personenbezogenen Daten bei uns, bis der Zweck für die Datenverarbeitung entfällt. Wenn Sie ein berechtigtes
        Löschersuchen geltend machen oder eine Einwilligung zur Datenverarbeitung widerrufen, werden Ihre Daten gelöscht,
        sofern wir keine anderen rechtlich zulässigen Gründe für die Speicherung Ihrer personenbezogenen Daten haben (z. B.
        steuer- oder handelsrechtliche Aufbewahrungsfristen); im letztgenannten Fall erfolgt die Löschung nach Fortfall
        dieser Gründe. Die Fristen im Intranet finden Sie in Abschnitt 6.
      </p>

      <h3>Allgemeine Hinweise zu den Rechtsgrundlagen der Datenverarbeitung</h3>
      <p>
        Sofern Sie in die Datenverarbeitung eingewilligt haben, verarbeiten wir Ihre personenbezogenen Daten auf
        Grundlage von Art. 6 Abs. 1 lit. a DSGVO bzw. Art. 9 Abs. 2 lit. a DSGVO, sofern besondere Datenkategorien nach
        Art. 9 Abs. 1 DSGVO verarbeitet werden. Im Falle einer ausdrücklichen Einwilligung in die Übertragung
        personenbezogener Daten in Drittstaaten erfolgt die Datenverarbeitung außerdem auf Grundlage von Art. 49 Abs. 1
        lit. a DSGVO. Sofern Sie in die Speicherung von Cookies oder in den Zugriff auf Informationen in Ihr Endgerät
        (z. B. via Device-Fingerprinting) eingewilligt haben, erfolgt die Datenverarbeitung zusätzlich auf Grundlage von
        § 25 Abs. 1 TDDDG. Die Einwilligung ist jederzeit widerrufbar. Sind Ihre Daten zur Vertragserfüllung oder zur
        Durchführung vorvertraglicher Maßnahmen erforderlich, verarbeiten wir Ihre Daten auf Grundlage des Art. 6 Abs. 1
        lit. b DSGVO; dazu gehört die Mitgliedschaft im Verein nach unserer Satzung. Des Weiteren verarbeiten wir Ihre
        Daten, sofern diese zur Erfüllung einer rechtlichen Verpflichtung erforderlich sind, auf Grundlage von Art. 6 Abs.
        1 lit. c DSGVO. Die Datenverarbeitung kann ferner auf Grundlage unseres berechtigten Interesses nach Art. 6 Abs. 1
        lit. f DSGVO erfolgen. Über die jeweils im Einzelfall einschlägigen Rechtsgrundlagen wird in den folgenden
        Absätzen dieser Datenschutzerklärung informiert.
      </p>

      <h3>Empfänger von personenbezogenen Daten</h3>
      <p>
        Im Rahmen unserer Vereinstätigkeit arbeiten wir mit verschiedenen externen Stellen zusammen. Dabei ist teilweise
        auch eine Übermittlung von personenbezogenen Daten an diese externen Stellen erforderlich. Wir geben
        personenbezogene Daten nur dann an externe Stellen weiter, wenn dies im Rahmen einer Vertragserfüllung
        erforderlich ist, wenn wir gesetzlich hierzu verpflichtet sind (z. B. Weitergabe von Daten an Steuerbehörden),
        wenn wir ein berechtigtes Interesse nach Art. 6 Abs. 1 lit. f DSGVO an der Weitergabe haben oder wenn eine
        sonstige Rechtsgrundlage die Datenweitergabe erlaubt. Beim Einsatz von Auftragsverarbeitern geben wir
        personenbezogene Daten nur auf Grundlage eines gültigen Vertrags über Auftragsverarbeitung weiter. Im Falle einer
        gemeinsamen Verarbeitung wird ein Vertrag über gemeinsame Verarbeitung geschlossen.
      </p>

      <h3>Widerruf Ihrer Einwilligung zur Datenverarbeitung</h3>
      <p>
        Viele Datenverarbeitungsvorgänge sind nur mit Ihrer ausdrücklichen Einwilligung möglich. Sie können eine bereits
        erteilte Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten Datenverarbeitung
        bleibt vom Widerruf unberührt.
      </p>

      <h3>Widerspruchsrecht gegen die Datenerhebung in besonderen Fällen sowie gegen Direktwerbung (Art. 21 DSGVO)</h3>
      <p>
        WENN DIE DATENVERARBEITUNG AUF GRUNDLAGE VON ART. 6 ABS. 1 LIT. E ODER F DSGVO ERFOLGT, HABEN SIE JEDERZEIT DAS
        RECHT, AUS GRÜNDEN, DIE SICH AUS IHRER BESONDEREN SITUATION ERGEBEN, GEGEN DIE VERARBEITUNG IHRER PERSONENBEZOGENEN
        DATEN WIDERSPRUCH EINZULEGEN; DIES GILT AUCH FÜR EIN AUF DIESE BESTIMMUNGEN GESTÜTZTES PROFILING. DIE JEWEILIGE
        RECHTSGRUNDLAGE, AUF DENEN EINE VERARBEITUNG BERUHT, ENTNEHMEN SIE DIESER DATENSCHUTZERKLÄRUNG. WENN SIE
        WIDERSPRUCH EINLEGEN, WERDEN WIR IHRE BETROFFENEN PERSONENBEZOGENEN DATEN NICHT MEHR VERARBEITEN, ES SEI DENN, WIR
        KÖNNEN ZWINGENDE SCHUTZWÜRDIGE GRÜNDE FÜR DIE VERARBEITUNG NACHWEISEN, DIE IHRE INTERESSEN, RECHTE UND FREIHEITEN
        ÜBERWIEGEN ODER DIE VERARBEITUNG DIENT DER GELTENDMACHUNG, AUSÜBUNG ODER VERTEIDIGUNG VON RECHTSANSPRÜCHEN
        (WIDERSPRUCH NACH ART. 21 ABS. 1 DSGVO).
      </p>
      <p>
        WERDEN IHRE PERSONENBEZOGENEN DATEN VERARBEITET, UM DIREKTWERBUNG ZU BETREIBEN, SO HABEN SIE DAS RECHT, JEDERZEIT
        WIDERSPRUCH GEGEN DIE VERARBEITUNG SIE BETREFFENDER PERSONENBEZOGENER DATEN ZUM ZWECKE DERARTIGER WERBUNG
        EINZULEGEN; DIES GILT AUCH FÜR DAS PROFILING, SOWEIT ES MIT SOLCHER DIREKTWERBUNG IN VERBINDUNG STEHT. WENN SIE
        WIDERSPRECHEN, WERDEN IHRE PERSONENBEZOGENEN DATEN ANSCHLIESSEND NICHT MEHR ZUM ZWECKE DER DIREKTWERBUNG VERWENDET
        (WIDERSPRUCH NACH ART. 21 ABS. 2 DSGVO).
      </p>

      <h3>Beschwerde&shy;recht bei der zuständigen Aufsichts&shy;behörde</h3>
      <p>
        Im Falle von Verstößen gegen die DSGVO steht den Betroffenen ein Beschwerderecht bei einer Aufsichtsbehörde,
        insbesondere in dem Mitgliedstaat ihres gewöhnlichen Aufenthalts, ihres Arbeitsplatzes oder des Orts des
        mutmaßlichen Verstoßes zu. Das Beschwerderecht besteht unbeschadet anderweitiger verwaltungsrechtlicher oder
        gerichtlicher Rechtsbehelfe. Für uns zuständig ist das Bayerische Landesamt für Datenschutzaufsicht, Promenade
        18, 91522 Ansbach.
      </p>

      <h3>Recht auf Daten&shy;übertrag&shy;barkeit</h3>
      <p>
        Sie haben das Recht, Daten, die wir auf Grundlage Ihrer Einwilligung oder in Erfüllung eines Vertrags
        automatisiert verarbeiten, an sich oder an einen Dritten in einem gängigen, maschinenlesbaren Format aushändigen
        zu lassen. Sofern Sie die direkte Übertragung der Daten an einen anderen Verantwortlichen verlangen, erfolgt dies
        nur, soweit es technisch machbar ist.
      </p>

      <h3>Auskunft, Berichtigung und Löschung</h3>
      <p>
        Sie haben im Rahmen der geltenden gesetzlichen Bestimmungen jederzeit das Recht auf unentgeltliche Auskunft über
        Ihre gespeicherten personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck der Datenverarbeitung und
        ggf. ein Recht auf Berichtigung oder Löschung dieser Daten. Hierzu sowie zu weiteren Fragen zum Thema
        personenbezogene Daten können Sie sich jederzeit an uns wenden.
      </p>

      <h3>Recht auf Einschränkung der Verarbeitung</h3>
      <p>
        Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten zu verlangen. Hierzu können
        Sie sich jederzeit an uns wenden. Das Recht auf Einschränkung der Verarbeitung besteht in folgenden Fällen:
      </p>
      <ul>
        <li>
          Wenn Sie die Richtigkeit Ihrer bei uns gespeicherten personenbezogenen Daten bestreiten, benötigen wir in der
          Regel Zeit, um dies zu überprüfen. Für die Dauer der Prüfung haben Sie das Recht, die Einschränkung der
          Verarbeitung Ihrer personenbezogenen Daten zu verlangen.
        </li>
        <li>
          Wenn die Verarbeitung Ihrer personenbezogenen Daten unrechtmäßig geschah/geschieht, können Sie statt der
          Löschung die Einschränkung der Datenverarbeitung verlangen.
        </li>
        <li>
          Wenn wir Ihre personenbezogenen Daten nicht mehr benötigen, Sie sie jedoch zur Ausübung, Verteidigung oder
          Geltendmachung von Rechtsansprüchen benötigen, haben Sie das Recht, statt der Löschung die Einschränkung der
          Verarbeitung Ihrer personenbezogenen Daten zu verlangen.
        </li>
        <li>
          Wenn Sie einen Widerspruch nach Art. 21 Abs. 1 DSGVO eingelegt haben, muss eine Abwägung zwischen Ihren und
          unseren Interessen vorgenommen werden. Solange noch nicht feststeht, wessen Interessen überwiegen, haben Sie das
          Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten zu verlangen.
        </li>
      </ul>
      <p>
        Wenn Sie die Verarbeitung Ihrer personenbezogenen Daten eingeschränkt haben, dürfen diese Daten – von ihrer
        Speicherung abgesehen – nur mit Ihrer Einwilligung oder zur Geltendmachung, Ausübung oder Verteidigung von
        Rechtsansprüchen oder zum Schutz der Rechte einer anderen natürlichen oder juristischen Person oder aus Gründen
        eines wichtigen öffentlichen Interesses der Europäischen Union oder eines Mitgliedstaats verarbeitet werden.
      </p>

      <h3>SSL- bzw. TLS-Verschlüsselung</h3>
      <p>
        Das Intranet nutzt aus Sicherheitsgründen und zum Schutz der Übertragung vertraulicher Inhalte, wie zum Beispiel
        Ihrer Mitglieds- und Bankdaten, eine SSL- bzw. TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen Sie
        daran, dass die Adresszeile des Browsers von „http://“ auf „https://“ wechselt und an dem Schloss-Symbol in Ihrer
        Browserzeile.
      </p>
      <p>
        Wenn die SSL- bzw. TLS-Verschlüsselung aktiviert ist, können die Daten, die Sie an uns übermitteln, nicht von
        Dritten mitgelesen werden.
      </p>

      <h3>Widerspruch gegen Werbe-E-Mails</h3>
      <p>
        Der Nutzung von im Rahmen der Impressumspflicht veröffentlichten Kontaktdaten zur Übersendung von nicht
        ausdrücklich angeforderter Werbung und Informationsmaterialien wird hiermit widersprochen. Die Betreiber der
        Seiten behalten sich ausdrücklich rechtliche Schritte im Falle der unverlangten Zusendung von
        Werbeinformationen, etwa durch Spam-E-Mails, vor.
      </p>

      <h2>4. Datenerfassung im Intranet</h2>

      <h3>Mitgliedsantrag und Konto</h3>
      <p>Mit dem Mitgliedsantrag im Intranet erheben wir folgende Angaben:</p>
      <ul>
        <li>Vorname und Nachname</li>
        <li>Geburtsdatum</li>
        <li>Anschrift (Straße, Hausnummer, Postleitzahl, Ort)</li>
        <li>E-Mail-Adresse und Handynummer</li>
        <li>
          ob Sie studieren; falls ja, Studiengang, angestrebter Abschluss, Semester und Hochschule
        </li>
        <li>IBAN und BIC sowie Ihre Bestätigung des SEPA-Lastschriftmandats</li>
        <li>ein Passwort für Ihr Konto</li>
      </ul>
      <p>
        Alle Angaben sind Pflichtangaben. Ohne sie können wir Ihre Mitgliedschaft nicht führen und den Beitrag nicht
        einziehen. Ihr Konto wird erst aktiv, wenn Sie Ihre E-Mail-Adresse über den Link in unserer Bestätigungs-E-Mail
        bestätigt haben. Bis dahin speichern wir Ihre Angaben vorläufig. Über jede neue Registrierung informieren wir den
        Vorstand per E-Mail (Name, E-Mail-Adresse, Studienangaben, Datum des Antrags).
      </p>
      <p>
        Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO, weil wir die Angaben für Ihre
        Mitgliedschaft und den Beitragseinzug benötigen. Einen Teil der Angaben können Sie später in Ihrem Profil selbst
        ändern.
      </p>

      <h3>Prüfung der IBAN</h3>
      <p>
        Wenn Sie im Mitgliedsantrag Ihre IBAN eingeben, prüft unser Server sie über den öffentlichen Prüfdienst
        openiban.com auf Gültigkeit und ermittelt die zugehörige BIC. Übermittelt wird nur die IBAN, nicht Ihr Name oder
        andere Angaben; die Anfrage stellt unser Server, nicht Ihr Browser. Nach Angaben des Dienstes werden dort keine
        Daten gespeichert und keine Protokolle geschrieben. Der Dienst wird über das Netz von Cloudflare ausgeliefert;
        eine Verarbeitung außerhalb der EU ist daher nicht ausgeschlossen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f
        DSGVO; wir haben ein berechtigtes Interesse daran, Tippfehler in der Bankverbindung früh zu erkennen und
        Rücklastschriften zu vermeiden.
      </p>

      <h3>Schutz vor Missbrauch (Cloudflare Turnstile)</h3>
      <p>
        Bei der Registrierung, der Anmeldung und beim Zurücksetzen des Passworts schützen wir das Intranet mit Cloudflare
        Turnstile vor automatisierten Anfragen (Bots). Anbieter ist die Cloudflare, Inc., 101 Townsend St., San
        Francisco, CA 94107, USA. Turnstile wertet dazu technische Merkmale Ihres Browsers aus, insbesondere IP-Adresse,
        Browserkennung (User-Agent) und Merkmale der verschlüsselten Verbindung. Zur Prüfung des Ergebnisses übermittelt
        unser Server zusätzlich Ihre IP-Adresse an Cloudflare. Cloudflare verwendet diese Merkmale nach eigenen Angaben
        außerdem in eigener Verantwortung, um die Bot-Erkennung zu verbessern (
        <a href="https://www.cloudflare.com/turnstile-privacy-policy/" rel="noopener">
          Datenschutzhinweise zu Turnstile
        </a>
        ).
      </p>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; wir haben ein berechtigtes Interesse daran, Konten und
        Mitgliedsdaten vor Missbrauch zu schützen. Der Zugriff auf Informationen in Ihrem Endgerät ist dafür unbedingt
        erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Mit Cloudflare besteht ein Vertrag über Auftragsverarbeitung. Cloudflare
        ist nach dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO).
      </p>
      <p>
        Zusätzlich begrenzen wir die Zahl der Versuche bei Registrierung, Anmeldung, Passwort-Reset und Änderung der
        E-Mail-Adresse. Dafür speichern wir die IP-Adresse bzw. E-Mail-Adresse nur als nicht umkehrbaren, gekürzten
        Hashwert und löschen ihn nach einem Tag (Art. 6 Abs. 1 lit. f DSGVO, Schutz vor Missbrauch).
      </p>

      <h3>Anmeldung, Cookies und lokaler Speicher</h3>
      <p>
        Wenn Sie sich anmelden, speichert Ihr Browser ein Cookie mit Ihrer Sitzung (Name beginnt mit „sb-“), damit Sie
        angemeldet bleiben. Beim Zurücksetzen des Passworts kommt kurzzeitig ein weiteres Cookie für die Prüfung des
        Links hinzu. Das Sitzungs-Cookie wird gelöscht, wenn Sie sich abmelden, und läuft sonst spätestens nach 400 Tagen
        ab. Ihre Wahl zwischen hellem und dunklem Design speichert Ihr Browser im lokalen Speicher (Eintrag „theme“);
        dieser Eintrag verlässt Ihr Gerät nicht.
      </p>
      <p>
        Weitere Cookies setzen wir nicht. Die genannten Cookies und Einträge sind für die Nutzung des Intranets unbedingt
        erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); Rechtsgrundlage der Verarbeitung ist Art. 6 Abs. 1 lit. b DSGVO. Zur
        Sicherheit Ihres Kontos protokolliert Supabase Anmeldevorgänge einschließlich Zeitpunkt und IP-Adresse (Art. 6
        Abs. 1 lit. f DSGVO).
      </p>

      <h3>Was andere Mitglieder sehen</h3>
      <p>
        Im Mitgliederverzeichnis sehen alle angemeldeten Mitglieder Vor- und Nachname sowie Studiengang der aktiven
        Mitglieder und Alumni. Bei Veranstaltungen sehen Mitglieder nur die Zahl der Anmeldungen, nicht wer sich
        angemeldet hat. Auf der Seite „Vorstand“ stellen wir die Mitglieder des Vorstands mit Name, Amt, Foto und
        LinkedIn-Profil vor. Alle übrigen Angaben aus Ihrem Profil sind für andere Mitglieder nicht sichtbar.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Austausch der Mitglieder untereinander als Vereinszweck).
      </p>

      <h3>Zugriff durch Vorstand und Admins</h3>
      <p>
        Der Vorstand kann einzelne Mitglieder mit Verwaltungsaufgaben betrauen (Rolle „Admin“). Admins sehen in der
        Mitgliederliste Name, Studiengang, E-Mail-Adresse, Handynummer, Status und Rolle, die Teilnehmerlisten von
        Veranstaltungen sowie Anträge auf Alumni-Status und Zeitschriftenzugang (Name, E-Mail-Adresse, Datum).
      </p>
      <p>
        Der Vorstand sieht zusätzlich Anschrift und Geburtsdatum, kann Angaben im Auftrag eines Mitglieds korrigieren,
        sieht Kündigungen mit Kündigungsgrund und erstellt die Dateien für den Beitragseinzug und den Zeitschriftenzugang
        (siehe unten). Bei Korrekturen protokollieren wir, wer wann welche Felder geändert hat; die Werte selbst nicht.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h3>Veranstaltungen</h3>
      <p>
        Wenn Sie sich zu einer Veranstaltung anmelden, speichern wir, wer sich wann angemeldet hat. Vorstand und Admins
        sehen die Teilnehmerliste mit Name, Studiengang, Rolle und Zeitpunkt der Anmeldung, um die Veranstaltung zu
        organisieren (Art. 6 Abs. 1 lit. b DSGVO). Titel, Datum, Uhrzeit, Ort und Veranstalter der Termine erscheinen
        auch auf unserer öffentlichen Website; Angaben zu Teilnehmenden werden dorthin nicht übertragen. Bilder zu
        Veranstaltungen sind über ihre Adresse auch ohne Anmeldung abrufbar.
      </p>

      <h3>Schwarzes Brett</h3>
      <p>
        Bei Beiträgen am Schwarzen Brett speichern wir, wer sie verfasst hat. Damit wir neue Beiträge markieren können,
        speichern wir außerdem den Zeitpunkt, zu dem Sie das Schwarze Brett zuletzt aufgerufen haben (Art. 6 Abs. 1 lit.
        b DSGVO).
      </p>

      <h3>Mitgliedsbeitrag und SEPA-Lastschrift</h3>
      <p>
        Für den Einzug des Mitgliedsbeitrags erstellt der Vorstand je Semester eine Datei mit Name, IBAN, BIC, Betrag,
        Mandatsreferenz und Datum des Mandats und reicht sie bei unserem Kreditinstitut ein. Wir protokollieren, wer wann
        eine solche Datei erstellt hat und wie viele Buchungen sie enthält. Ändern Sie Ihre IBAN im Profil, informieren
        wir den Vorstand per E-Mail mit Ihrem Namen, Ihrer E-Mail-Adresse und den letzten vier Stellen der alten und der
        neuen IBAN. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für die Aufbewahrung Art. 6 Abs. 1 lit. c DSGVO.
      </p>

      <h3>Zeitschriftenzugang über den BVH</h3>
      <p>
        Wenn Sie im Intranet einen Zugang zu den Zeitschriften des Bundesverbands der Börsenvereine an deutschen
        Hochschulen (BVH) e.V., Mannheim, beantragen, übermittelt der Vorstand dem BVH Ihren Namen, Ihre E-Mail-Adresse,
        Ihr Geschlecht, Ihre Telefonnummer, Ihr Geburtsdatum und Ihre Anschrift, damit der BVH Ihnen einen Zugang
        einrichtet. Ab dann ist der BVH für die Verarbeitung selbst verantwortlich; es gelten die{" "}
        <a href="https://bvh.org/homepage/datenschutz.php" rel="noopener">
          Datenschutzhinweise des BVH
        </a>
        . Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, weil Sie den Zugang beantragen.
      </p>

      <h3>Alumni-Status und Kündigung</h3>
      <p>
        Beantragen Sie den Alumni-Status, informieren wir den Vorstand per E-Mail (Name, E-Mail-Adresse, Rolle,
        Studiengang, Eintrittsdatum) und teilen Ihnen die Entscheidung per E-Mail mit.
      </p>
      <p>
        Kündigen Sie Ihre Mitgliedschaft im Intranet, können Sie freiwillig einen Grund auswählen und einen Text dazu
        schreiben. Der Vorstand erhält eine E-Mail mit Name, E-Mail-Adresse, Mitgliedsnummer, Rolle, Studiengang,
        Eintritts- und Kündigungsdatum sowie dem Grund; Sie erhalten eine Bestätigung. Ihr Zugang zum Intranet wird mit
        der Kündigung gesperrt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für den freiwilligen Kündigungsgrund
        Art. 6 Abs. 1 lit. f DSGVO (Verbesserung unseres Vereinsangebots).
      </p>

      <h3>WhatsApp-Gruppe</h3>
      <p>
        Aktive Mitglieder finden im Intranet den Einladungslink zu unserer WhatsApp-Gruppe, auch als QR-Code. Den QR-Code
        erzeugt unser Server selbst; beim Aufruf der Seite werden keine Daten an WhatsApp übertragen. Erst wenn Sie den
        Link öffnen und der Gruppe beitreten, verarbeitet WhatsApp Ihre Daten. Anbieter ist für Nutzer in der EU die
        WhatsApp Ireland Limited, Merrion Road, Dublin 4, D04 X2K5, Irland; es gilt die{" "}
        <a href="https://www.whatsapp.com/legal/privacy-policy-eea" rel="noopener">
          Datenschutzrichtlinie von WhatsApp
        </a>
        . In der Gruppe sehen die anderen Mitglieder Ihre Telefonnummer und Ihren WhatsApp-Namen.
      </p>

      <h3>Links zu anderen Anbietern</h3>
      <p>
        Verweise auf LinkedIn-Profile, das Portal des BVH oder Links in Beiträgen und Veranstaltungen sind einfache
        Links. Inhalte oder Skripte dieser Anbieter sind nicht eingebunden. Daten werden erst übertragen, wenn Sie einen
        Link anklicken; dort gelten die Datenschutzhinweise des jeweiligen Anbieters. Schriften und Symbole liefern wir
        von unserem eigenen Server aus; eine Verbindung zu Google Fonts oder anderen Schriftanbietern findet nicht statt.
      </p>

      <h2>5. E-Mails</h2>

      <h3>Versand über Resend</h3>
      <p>E-Mails aus dem Intranet verschicken wir über den Versanddienst Resend. Das sind:</p>
      <ul>
        <li>
          E-Mails zu Ihrem Konto: Bestätigung der E-Mail-Adresse, Zurücksetzen des Passworts und Änderung der
          E-Mail-Adresse (an die alte und die neue Adresse)
        </li>
        <li>Bestätigungen zu Ihrer Kündigung und die Entscheidung über einen Alumni-Antrag</li>
        <li>Einladungen zu Veranstaltungen an alle aktiven Mitglieder oder an einzelne Adressen, die der Vorstand eingibt</li>
        <li>Benachrichtigungen an den Vorstand zu Registrierungen, Kündigungen, Alumni-Anträgen und IBAN-Änderungen</li>
        <li>Erinnerungen an Aufgaben für Vorstand und Admins</li>
      </ul>
      <p>
        Anbieter ist die Plus Five Five, Inc. (Resend), 2261 Market Street #5039, San Francisco, CA 94114, USA. Resend
        kann die Daten dabei auch in den USA verarbeiten und speichert die Nachricht und Versandprotokolle für einen
        begrenzten Zeitraum (derzeit bis zu 30 Tage). Mit Resend besteht ein Vertrag über Auftragsverarbeitung. Für
        Übermittlungen in die USA ist Resend nach dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO);
        zusätzlich gelten die EU-Standardvertragsklauseln.
      </p>
      <p>
        Jede Einladung zu einer Veranstaltung geht einzeln an eine Adresse; die Empfänger sehen einander nicht.
        Rechtsgrundlage für alle genannten E-Mails ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung der Mitgliedschaft und
        Information über Vereinsveranstaltungen).
      </p>

      <h3>Postfächer des Vorstands</h3>
      <p>
        Unsere E-Mail-Postfächer betreiben wir bei Google Workspace (Google Cloud EMEA Limited, Irland). Benachrichtigungen
        an den Vorstand und Nachrichten, die Sie uns per E-Mail senden, werden dort gespeichert und verarbeitet. Mit
        Google besteht ein Vertrag über Auftragsverarbeitung (Cloud Data Processing Addendum). Eine Verarbeitung in den
        USA ist nicht ausgeschlossen; Google LLC ist nach dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO).
      </p>

      <h2>6. Speicherdauer im Intranet</h2>
      <p>
        Ihre Daten speichern wir für die Dauer Ihrer Mitgliedschaft. Mit der Kündigung sperren wir Ihren Zugang zum
        Intranet. Nach dem Ende der Mitgliedschaft löschen wir Ihre Daten. Ausgenommen sind Angaben, die wir für
        Beitrag und Buchhaltung aufbewahren müssen (Name, Bankverbindung, Mandatsreferenz und -datum sowie die
        eingezogenen Beiträge). Diese bewahren wir nach den gesetzlichen Fristen, insbesondere § 147 AO, bis zu zehn
        Jahre auf und sperren sie für jede andere Verwendung.
      </p>
      <p>Daneben gelten folgende Fristen:</p>
      <ul>
        <li>Hashwerte zum Schutz vor Missbrauch: ein Tag</li>
        <li>Text zum Kündigungsgrund: aus den E-Mail-Daten nach 30 Tagen, aus der Kündigungsübersicht nach 24 Monaten</li>
        <li>Nachrichten und Versandprotokolle bei Resend: bis zu 30 Tage</li>
      </ul>

      <p className="pt-6 text-sm">Stand: Oktober 2026</p>
    </LegalPage>
  );
}
