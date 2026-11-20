"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Landmark, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/app/(intranet)/profile/actions";
import { maskIban } from "@/components/profile/profile-format";
import { ProfileCard, Row, Rows } from "@/components/profile/ProfileCard";
import {
  FeldFehler,
  GespeichertHaken,
  HandyEingabe,
  IbanEingabe,
  LandAuswahl,
  type HandyWert,
} from "@/components/member/MemberInputs";
import { ibanInViererbloecken } from "@/lib/member-rules-client";
import { plzInputMode } from "@/lib/member-inputs";
import { cn } from "@/lib/utils";
import { EmailAendernFenster, type FensterErgebnis, type Postfach } from "@/components/profile/EmailAendernFenster";
import {
  geradeBestaetigt,
  startAnsicht,
  type EmailChangeStand,
  type EmailHinweis,
  type FensterAnsicht,
} from "@/lib/email-change";

export type ProfileContactData = {
  vorname: string;
  nachname: string;
  email: string;
  /** Neue Adresse, deren Bestätigung noch aussteht (auth.users.new_email, Links noch gültig), sonst null. */
  pendingEmail: string | null;
  /** Stand der Bestätigung in beiden Postfächern (public.email_change_stand()). */
  emailStand: EmailChangeStand;
  /** Rückkehr über den Link in der Mail (/profile?email=…): Fenster öffnet im passenden Stand. */
  emailHinweis: EmailHinweis | null;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  /** Land der Anschrift (ISO), leer gespeichert = DE. */
  land: string;
  /** Name des Landes für die Anzeige (auch Deutschland). */
  landName: string;
  /** Handy für die Eingabe aufgeteilt (Altwerte: DE + roh). */
  handyLand: string;
  handyNummer: string;
  /** Handy für die Anzeige (international formatiert, Altwerte roh). */
  handyAnzeige: string;
  /** Geburtsdatum YYYY-MM-DD oder leer (das Mitglied ändert es selbst, Entscheidung 11). */
  geburtsdatum: string;
  /** Alumni zahlen keinen Beitrag: IBAN nicht Pflicht. */
  alumni: boolean;
  iban: string;
  /** Beitragspflichtig (keine Alumni): dann stehen Zahlungsweise und Mandat in der Bankverbindung. */
  zahltBeitrag: boolean;
  /** Datum des SEPA-Mandats „TT.MM.JJJJ“ oder null. */
  mandatVom: string | null;
  /** Version der verschlüsselten Zeile beim Laden (0 = keine): optimistische Sperre beim Speichern. */
  version: number;
  /** Ohne Spalte land geladen (Übergang): der Server speichert das Land dann nicht. */
  landUnbekannt: boolean;
};

type Fehler = Partial<Record<string, string>>;

/**
 * Persönliche Daten und Bankverbindung als zwei gleich breite Kacheln (in der Lesesicht gleich hoch, im Bearbeiten behält jede ihre Höhe) (Skizze Profil.dc.html):
 * erst Lesesicht, der Stift öffnet das Formular im Abschnitt selbst. Gespeichert wird über updateProfile; der
 * Server prüft nach lib/member-rules.ts nur die Felder des Abschnitts (`section`) und meldet Fehler je Feld.
 * Nach dem Speichern zeichnet sich ein Haken.
 */
export function ProfileDataSections({ profile }: { profile: ProfileContactData }) {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:has-[form]:items-start">
      <PersonalSection profile={profile} />
      <BankSection profile={profile} />
    </div>
  );
}

function PersonalSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id);
  const email = useEmailFenster(profile);
  const [land, setLand] = useState(profile.land);
  const [handy, setHandy] = useState<HandyWert>({ land: profile.handyLand, nummer: profile.handyNummer });
  const name = `${profile.vorname} ${profile.nachname}`.trim();
  const streetLine = `${profile.strasse} ${profile.hausnummer}`.trim();
  const cityLine = `${profile.plz} ${profile.ort}`.trim();
  const f = editor.fehler;

  function open() {
    setLand(profile.land);
    setHandy({ land: profile.handyLand, nummer: profile.handyNummer });
    editor.open();
  }

  // Das Fenster steht neben der Kachel (nicht im Formular): React-Ereignisse aus dem Fenster (Absenden, Escape)
  // laufen sonst über das Portal hinweg bis ins Abschnittsformular.
  if (!editor.editing) {
    return (
      <>
      <ProfileCard id={id} title="Persönliche Daten" Icon={UserRound} onEdit={open}>
        <Rows>
          <Row label="Name" value={name} />
          <Row
            label="Anschrift"
            value={
              streetLine || cityLine ? (
                <>
                  {streetLine && <span className="block">{streetLine}</span>}
                  {cityLine && <span className="block">{cityLine}</span>}
                  {profile.landName && <span className="block">{profile.landName}</span>}
                </>
              ) : null
            }
          />
          <Row label="Geburtsdatum" value={datumDeutsch(profile.geburtsdatum)} empty="Noch nicht eingetragen" numeric />
          <Row label="E-Mail">
            <span className="block break-all">{email.email}</span>
            <EmailStandZeile fenster={email} />
          </Row>
          <Row label="Handynummer" value={profile.handyAnzeige} numeric />
        </Rows>
      </ProfileCard>
      <EmailFensterSlot fenster={email} />
      </>
    );
  }

  return (
    <>
    <ProfileCard id={id} title="Persönliche Daten" Icon={UserRound}>
      {editor.saved ? (
        <GespeichertHaken text="Persönliche Daten gespeichert" onFertig={editor.close} />
      ) : (
          <EditForm editor={editor}>
            <input type="hidden" name="section" value="personal" />
            <input type="hidden" name="version" value={profile.version} />
            <input type="hidden" name="vornameVorher" value={profile.vorname} />
            <input type="hidden" name="nachnameVorher" value={profile.nachname} />
            {profile.landUnbekannt && <input type="hidden" name="landUnbekannt" value="1" />}
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${id}-vorname`} label="Vorname" fehler={f.vorname}>
                <Input id={`${id}-vorname`} name="vorname" defaultValue={profile.vorname} autoComplete="given-name" autoFocus {...invalid(`${id}-vorname`, f.vorname)} onInput={() => editor.clear("vorname")} />
              </Field>
              <Field id={`${id}-nachname`} label="Nachname" fehler={f.nachname}>
                <Input id={`${id}-nachname`} name="nachname" defaultValue={profile.nachname} autoComplete="family-name" {...invalid(`${id}-nachname`, f.nachname)} onInput={() => editor.clear("nachname")} />
              </Field>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
              <Field id={`${id}-strasse`} label="Straße (optional)" fehler={f.strasse}>
                <Input id={`${id}-strasse`} name="strasse" defaultValue={profile.strasse} autoComplete="address-line1" {...invalid(`${id}-strasse`, f.strasse)} onInput={() => editor.clear("strasse")} />
              </Field>
              <Field id={`${id}-hausnummer`} label="Hausnr. (optional)" fehler={f.hausnummer}>
                <Input id={`${id}-hausnummer`} name="hausnummer" defaultValue={profile.hausnummer} {...invalid(`${id}-hausnummer`, f.hausnummer)} onInput={() => editor.clear("hausnummer")} />
              </Field>
            </div>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
              <Field id={`${id}-plz`} label="PLZ (optional)" fehler={f.plz}>
                <Input id={`${id}-plz`} name="plz" defaultValue={profile.plz} autoComplete="postal-code" inputMode={plzInputMode(land)} {...invalid(`${id}-plz`, f.plz)} onInput={() => editor.clear("plz")} />
              </Field>
              <Field id={`${id}-ort`} label="Ort (optional)" fehler={f.ort}>
                <Input id={`${id}-ort`} name="ort" defaultValue={profile.ort} autoComplete="address-level2" {...invalid(`${id}-ort`, f.ort)} onInput={() => editor.clear("ort")} />
              </Field>
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-land`}>Land</FieldLabel>
              <LandAuswahl
                id={`${id}-land`}
                wert={land}
                onChange={(l) => {
                  setLand(l);
                  editor.clear("land", "plz", "hausnummer", "ort");
                }}
                fehler={f.land}
              />
            </div>
            <Field id={`${id}-geburtsdatum`} label="Geburtsdatum" fehler={f.geburtsdatum}>
              <Input
                id={`${id}-geburtsdatum`}
                name="geburtsdatum"
                type="date"
                defaultValue={profile.geburtsdatum}
                max={new Date().toISOString().slice(0, 10)}
                autoComplete="bday"
                {...invalid(`${id}-geburtsdatum`, f.geburtsdatum)}
                onInput={() => editor.clear("geburtsdatum")}
              />
            </Field>
            <EmailEditField id={id} fenster={email} />
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-handy`}>Handynummer (optional)</FieldLabel>
              <HandyEingabe
                id={`${id}-handy`}
                wert={handy}
                onChange={(w) => {
                  setHandy(w);
                  editor.clear("handynummer");
                }}
                autoComplete="tel"
                fehler={f.handynummer}
              />
            </div>
          </EditForm>
      )}
    </ProfileCard>
    <EmailFensterSlot fenster={email} />
    </>
  );
}

/** YYYY-MM-DD → TT.MM.JJJJ (leer bleibt leer). */
function datumDeutsch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** aria-Attribute eines Felds mit Fehler. */
function invalid(id: string, fehler?: string) {
  return fehler ? { "aria-invalid": true as const, "aria-describedby": `${id}-fehler` } : {};
}

type EmailFenster = ReturnType<typeof useEmailFenster>;

/**
 * E-Mail ändern im Fenster (components/profile/EmailAendernFenster.tsx). Das Profil zeigt bis zur zweiten
 * Bestätigung die bisherige Adresse und darunter „Änderung offen · n von 2“; der Stand im Profil ändert sich erst,
 * wenn das Fenster zu ist (nichts bewegt sich hinter einem offenen Fenster). Kommt man über den Link aus der Mail
 * (`?email=…`), geht das Fenster gleich im passenden Stand auf.
 */
function useEmailFenster(profile: ProfileContactData) {
  const router = useRouter();
  const [email, setEmail] = useState(profile.email);
  const [neueAdresse, setNeueAdresse] = useState(profile.pendingEmail);
  const [stand, setStand] = useState(profile.emailStand);
  const [geaendert, setGeaendert] = useState(profile.emailHinweis === "geaendert" && !profile.emailStand.offen);
  // Startansicht aus dem Link in der Mail; danach nur noch über die Knöpfe.
  const [fenster, setFenster] = useState<{ ansicht: FensterAnsicht; gerade: Postfach | null; meldung?: string } | null>(
    () => {
      const ansicht = startAnsicht(profile.emailHinweis, profile.emailStand);
      if (!ansicht) return null;
      return {
        ansicht,
        gerade: geradeBestaetigt(profile.emailHinweis, profile.emailStand),
        meldung: profile.emailHinweis === "fehler" && ansicht === "postfaecher" ? "Dieser Link gilt nicht mehr." : undefined,
      };
    },
  );
  // Fokus nach dem Schließen zurück auf den Auslöser (Link oder Zeile „Änderung offen“).
  const ausloeser = useRef<HTMLElement | null>(null);

  // Hinweis aus der Adresse nehmen, damit Neuladen das Fenster nicht noch einmal öffnet (Reiter bleibt).
  useEffect(() => {
    if (!profile.emailHinweis) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("email")) return;
    url.searchParams.delete("email");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [profile.emailHinweis]);

  function oeffnen(ansicht: FensterAnsicht, ausgeloestVon?: HTMLElement | null) {
    ausloeser.current = ausgeloestVon ?? null;
    setGeaendert(false);
    setFenster({ ansicht, gerade: null });
  }

  function geschlossen(ergebnis: FensterErgebnis) {
    setFenster(null);
    if (ergebnis.art === "geaendert") {
      setEmail(ergebnis.email);
      setNeueAdresse(null);
      setStand({ offen: false, alt: false, neu: false, anzahl: 0, erneutInSekunden: 0 });
      setGeaendert(true);
      // Server-Teile (Sidebar, Profil) mit der neuen Adresse nachladen.
      router.refresh();
    } else {
      setNeueAdresse(ergebnis.neueAdresse);
      setStand(ergebnis.stand);
    }
    const ziel = ausloeser.current;
    if (ziel?.isConnected) window.requestAnimationFrame(() => ziel.focus());
  }

  return { email, neueAdresse, stand, geaendert, fenster, oeffnen, geschlossen };
}

/** Fenster, solange es offen ist (eigener Zustand je Öffnen). */
function EmailFensterSlot({ fenster }: { fenster: EmailFenster }) {
  if (!fenster.fenster) return null;
  return (
    <EmailAendernFenster
      ansicht={fenster.fenster.ansicht}
      email={fenster.email}
      neueAdresse={fenster.neueAdresse}
      stand={fenster.stand}
      gerade={fenster.fenster.gerade}
      meldung={fenster.fenster.meldung}
      onClose={fenster.geschlossen}
    />
  );
}

/**
 * Unter der Adresse: „Änderung offen · n von 2“ mit zwei Punkten (keine Pille), Klick öffnet das Fenster bei den
 * Postfächern. Nach dem Erfolg ein kurzes „Geändert“.
 */
function EmailStandZeile({ fenster }: { fenster: EmailFenster }) {
  if (fenster.stand.offen && fenster.neueAdresse) {
    const n = fenster.stand.anzahl;
    return (
      <button
        type="button"
        onClick={(e) => fenster.oeffnen("postfaecher", e.currentTarget)}
        className="group -my-1.5 inline-flex min-h-11 items-center gap-2 rounded-sm text-[0.8125rem] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {[0, 1].map((i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "size-2 rounded-full border-[1.5px] border-primary transition-colors duration-400",
              i < n ? "bg-primary" : "bg-transparent",
            )}
          />
        ))}
        <span className="group-hover:underline">Änderung offen · {n} von 2</span>
      </button>
    );
  }
  if (fenster.geaendert) {
    return (
      <p
        role="status"
        data-reveal="fade"
        style={{ "--reveal-delay": "0s" } as CSSProperties}
        className="mt-1 inline-flex min-h-7 items-center gap-1.5 text-[0.8125rem] font-semibold text-success"
      >
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
        Geändert
      </p>
    );
  }
  return null;
}

/**
 * E-Mail im Bearbeiten: grau gesperrtes Feld, rechts in der Beschriftungszeile „E-Mail ändern“ (öffnet das
 * Fenster). Der Link bleibt auch bei offener Änderung: Eine neue Anfrage ersetzt die alte (GoTrue kennt kein
 * Abbrechen).
 */
function EmailEditField({ id, fenster }: { id: string; fenster: EmailFenster }) {
  const inputId = `${id}-email`;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={inputId}>E-Mail</FieldLabel>
        <button
          type="button"
          onClick={(e) => fenster.oeffnen("eingabe", e.currentTarget)}
          className="-my-3 rounded-sm py-3 text-[0.8125rem] font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          E-Mail ändern
        </button>
      </div>
      <Input
        id={inputId}
        value={fenster.email}
        readOnly
        className="cursor-not-allowed bg-muted text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/20 dark:bg-muted"
      />
      <EmailStandZeile fenster={fenster} />
    </div>
  );
}

function BankSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id);
  const [iban, setIban] = useState(() => ibanInViererbloecken(profile.iban));
  const f = editor.fehler;

  function open() {
    setIban(ibanInViererbloecken(profile.iban));
    editor.open();
  }

  if (!editor.editing) {
    // Nur die letzten 4 Stellen der IBAN zeigen. Zahlungsweise und Mandat (früher eigene Karte unter
    // Mitgliedschaft) nur, wenn Beitrag eingezogen wird und eine IBAN da ist.
    return (
      <ProfileCard id={id} title="Bankverbindung" Icon={Landmark} onEdit={open}>
        <Rows>
          <Row
            label="IBAN"
            value={profile.iban ? maskIban(profile.iban) : null}
            empty="Noch keine Bankverbindung hinterlegt"
            mono
          />
          {profile.iban && profile.zahltBeitrag && (
            <>
              <Row label="Zahlungsweise" value="SEPA-Lastschrift" />
              {/* Ohne Datum keine Zeile: „Nicht angegeben“ sähe nach einem Fehler des Mitglieds aus. */}
              {profile.mandatVom && <Row label="Mandat vom" value={profile.mandatVom} numeric />}
            </>
          )}
        </Rows>
      </ProfileCard>
    );
  }

  return (
    <ProfileCard id={id} title="Bankverbindung" Icon={Landmark}>
      {editor.saved ? (
        <GespeichertHaken text="Bankverbindung gespeichert" onFertig={editor.close} />
      ) : (
        <EditForm editor={editor}>
          <input type="hidden" name="section" value="bank" />
          <input type="hidden" name="version" value={profile.version} />
          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${id}-iban`}>IBAN</FieldLabel>
            <IbanEingabe
              id={`${id}-iban`}
              wert={iban}
              onChange={(w) => {
                setIban(w);
                editor.clear("iban");
              }}
              placeholder={profile.alumni ? "Als Alumni nicht nötig" : undefined}
              fehler={f.iban}
            />
          </div>
        </EditForm>
      )}
    </ProfileCard>
  );
}

function FieldLabel({ htmlFor, id, children }: { htmlFor: string; id?: string; children: ReactNode }) {
  return (
    <Label id={id} htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-foreground">
      {children}
    </Label>
  );
}

function Field({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      <FeldFehler id={`${id}-fehler`}>{fehler}</FeldFehler>
    </div>
  );
}

type SectionEditor = ReturnType<typeof useSectionEditor>;

function useSectionEditor(anchorId: string) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fehler, setFehler] = useState<Fehler>({});
  const [pending, startTransition] = useTransition();
  // Nach Abbrechen/Speichern bekommt der Stift den Fokus zurück, statt ihn zu verlieren.
  const [refocus, setRefocus] = useState(false);

  useEffect(() => {
    if (editing || !refocus) return;
    document.getElementById(anchorId)?.querySelector<HTMLElement>('button[aria-label$="bearbeiten"]')?.focus();
  }, [editing, refocus, anchorId]);

  function open() {
    setError("");
    setFehler({});
    setSaved(false);
    setEditing(true);
  }

  function close() {
    setError("");
    setFehler({});
    setSaved(false);
    setRefocus(true);
    setEditing(false);
  }

  function cancel() {
    if (!pending) close();
  }

  /** Fehler eines Felds beim Ändern wegnehmen (der Server prüft beim Speichern erneut). */
  function clear(...felder: string[]) {
    setFehler((alt) => {
      if (!felder.some((feld) => alt[feld])) return alt;
      const neu = { ...alt };
      for (const feld of felder) delete neu[feld];
      return neu;
    });
  }

  // Eigener Submit statt <form action>: React setzt Formulare nach einer Action sonst
  // zurück, und bei einem Prüffehler wären die Eingaben weg.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError("");
    setFehler({});
    startTransition(async () => {
      try {
        const result = await updateProfile({ success: false, error: "" }, formData);
        if (result.success) {
          setSaved(true);
        } else if (result.fehler && Object.keys(result.fehler).length > 0) {
          setFehler(result.fehler);
          // Fokus auf das erste Feld mit Fehler.
          window.requestAnimationFrame(() =>
            document.getElementById(anchorId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
          );
        } else {
          setError(result.error || "Speichern hat nicht geklappt.");
        }
      } catch {
        setError("Speichern hat nicht geklappt. Bitte versuch es noch einmal.");
      }
    });
  }

  return { editing, saved, error, fehler, pending, open, close, cancel, clear, submit };
}

function EditForm({ editor, children }: { editor: SectionEditor; children: ReactNode }) {
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      editor.cancel();
    }
  }

  return (
    <form
      onSubmit={editor.submit}
      onKeyDown={onKeyDown}
      noValidate
      data-reveal="fade"
      style={{ "--reveal-delay": "0s" } as CSSProperties}
      className="space-y-3.5"
    >
      {children}
      {editor.error && (
        <p role="alert" className="text-sm text-destructive">
          {editor.error}
        </p>
      )}
      <div className="flex justify-end gap-2.5 pt-1.5">
        <Button type="button" variant="outline" className="h-10 px-4" onClick={editor.cancel} disabled={editor.pending}>
          Abbrechen
        </Button>
        <Button type="submit" className="h-10 px-4" disabled={editor.pending}>
          {editor.pending ? "Speichern…" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
