import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Impressum · ICR Intranet",
  robots: { index: false },
};

// Wortgleich mit dem Impressum der Website (eRecht24-Export in
// Investmentclub-Website/src/data/rechtstexte/impressum.erecht24.html plus Ergänzungsblock).
// Ändert sich dort etwas, hier nachziehen.
export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <p>
        Investment Club Regensburg e.V.
        <br />
        Gertraud-Kaltenecker-Straße 40
        <br />
        93049 Regensburg
      </p>

      <p>
        Vereinsregister: VR 201178
        <br />
        Registergericht: Amtsgericht Regensburg
      </p>

      <p>
        <strong>Vertreten durch:</strong>
        <br />
        Sarah Adloff (Vorsitzende)
      </p>

      <h2>Kontakt</h2>
      <p>E-Mail: info@investmentclubregensburg.com</p>

      <h2>Verbraucher&shy;streit&shy;beilegung/Universal&shy;schlichtungs&shy;stelle</h2>
      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen.
      </p>

      <section className="legal-addendum">
        <h2>Weiterer Kontaktweg</h2>
        <p>
          Kontaktformular:{" "}
          <a href="https://investmentclubregensburg.com/kontaktformular" rel="noopener">
            investmentclubregensburg.com/kontaktformular
          </a>
        </p>
      </section>
    </LegalPage>
  );
}
