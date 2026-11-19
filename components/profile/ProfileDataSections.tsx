"use client";

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Landmark, MailCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestEmailChange, updateProfile } from "@/app/(intranet)/profile/actions";
import { maskIban } from "@/components/profile/profile-format";
import { ProfileCard, Row, Rows } from "@/components/profile/ProfileCard";
import {
  FeldFehler,
  FeldHinweis,
  GespeichertHaken,
  HandyEingabe,
  IbanEingabe,
  LandAuswahl,
  type HandyWert,
} from "@/components/member/MemberInputs";
import { emailTippfehler, ibanInViererbloecken } from "@/lib/member-rules-client";
import { bicLandHinweis, plzInputMode } from "@/lib/member-inputs";

export type ProfileContactData = {
  vorname: string;
  nachname: string;
  email: string;
  /** Neue Adresse, deren Bestätigung noch aussteht (auth.users.new_email), sonst null. */
  pendingEmail: string | null;
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
  bic: string;
  /** Nicht blockierender Hinweis zur BIC (Land weicht ab), sonst null. */
  bicHinweis: string | null;
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
 * Persönliche Daten und Bankverbindung als zwei gleich breite, gleich hohe Kacheln (Skizze Profil.dc.html):
 * erst Lesesicht, der Stift öffnet das Formular im Abschnitt selbst. Gespeichert wird über updateProfile; der
 * Server prüft nach lib/member-rules.ts nur die Felder des Abschnitts (`section`) und meldet Fehler je Feld.
 * Nach dem Speichern zeichnet sich ein Haken.
 */
export function ProfileDataSections({ profile }: { profile: ProfileContactData }) {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <PersonalSection profile={profile} />
      <BankSection profile={profile} />
    </div>
  );
}

function PersonalSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id);
  const email = useEmailChange(id, profile.email, profile.pendingEmail);
  const [land, setLand] = useState(profile.land);
  const [handy, setHandy] = useState<HandyWert>({ land: profile.handyLand, nummer: profile.handyNummer });
  const name = `${profile.vorname} ${profile.nachname}`.trim();
  const streetLine = `${profile.strasse} ${profile.hausnummer}`.trim();
  const cityLine = `${profile.plz} ${profile.ort}`.trim();
  const f = editor.fehler;

  function open() {
    setLand(profile.land);
    setHandy({ land: profile.handyLand, nummer: profile.handyNummer });
    email.reset();
    editor.open();
  }

  if (!editor.editing) {
    return (
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
            <span className="block break-all">{profile.email}</span>
            {email.waitingFor && <PendingEmailHint address={email.waitingFor} />}
          </Row>
          <Row label="Handynummer" value={profile.handyAnzeige} numeric />
        </Rows>
      </ProfileCard>
    );
  }

  return (
    <ProfileCard id={id} title="Persönliche Daten" Icon={UserRound}>
      {editor.saved ? (
        <GespeichertHaken text="Persönliche Daten gespeichert" onFertig={editor.close} />
      ) : (
        <>
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
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <Field id={`${id}-strasse`} label="Straße" fehler={f.strasse}>
                <Input id={`${id}-strasse`} name="strasse" defaultValue={profile.strasse} autoComplete="address-line1" {...invalid(`${id}-strasse`, f.strasse)} onInput={() => editor.clear("strasse")} />
              </Field>
              <Field id={`${id}-hausnummer`} label="Hausnr." fehler={f.hausnummer}>
                <Input id={`${id}-hausnummer`} name="hausnummer" defaultValue={profile.hausnummer} {...invalid(`${id}-hausnummer`, f.hausnummer)} onInput={() => editor.clear("hausnummer")} />
              </Field>
            </div>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
              <Field id={`${id}-plz`} label="PLZ" fehler={f.plz}>
                <Input id={`${id}-plz`} name="plz" defaultValue={profile.plz} autoComplete="postal-code" inputMode={plzInputMode(land)} {...invalid(`${id}-plz`, f.plz)} onInput={() => editor.clear("plz")} />
              </Field>
              <Field id={`${id}-ort`} label="Ort" fehler={f.ort}>
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
            <EmailEditField id={id} currentEmail={profile.email} email={email} />
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${id}-handy`}>Handynummer</FieldLabel>
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
          {/* Eigenes Formular für die neue E-Mail-Adresse: steht im DOM außerhalb des Abschnittsformulars (kein
              <form> im <form>), die Felder im Kasten hängen über das form-Attribut daran. So bleiben beide getrennt
              absendbar, Enter im E-Mail-Feld schickt nur den Bestätigungslink. */}
          <form id={email.formId} onSubmit={email.submit} noValidate />
        </>
      )}
    </ProfileCard>
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

function PendingEmailHint({ id, address }: { id?: string; address: string }) {
  return (
    <span id={id} className="mt-1.5 flex items-start gap-1.5 text-xs leading-normal font-normal text-muted-foreground">
      <MailCheck className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        Neue Adresse <span className="font-semibold break-all text-foreground">{address}</span> wartet auf Bestätigung.
        Bitte den Link in der E-Mail anklicken.
      </span>
    </span>
  );
}

type EmailChange = ReturnType<typeof useEmailChange>;

/**
 * Änderung der E-Mail-Adresse: Sie gilt erst nach dem Klick auf den Link in der Bestätigungsmail (Supabase);
 * bis dahin steht die neue Adresse als „wartet auf Bestätigung“ unter der alten (Lese- und Bearbeitungssicht).
 */
function useEmailChange(sectionId: string, email: string, pendingEmail: string | null) {
  const formId = `${sectionId}-email-form`;
  const linkId = `${sectionId}-email-aendern`;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [tippfehler, setTippfehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Nach dem Schließen des Kastens bekommt der Link „E-Mail ändern“ den Fokus zurück.
  const [refocus, setRefocus] = useState(false);
  const waitingFor = sentTo ?? (pendingEmail && pendingEmail !== email ? pendingEmail : null);

  useEffect(() => {
    if (open || !refocus) return;
    document.getElementById(linkId)?.focus();
  }, [open, refocus, linkId]);

  function show() {
    setError("");
    setTippfehler(null);
    setRefocus(false);
    setOpen(true);
  }

  function hide() {
    if (pending) return;
    setRefocus(true);
    setOpen(false);
  }

  /** Beim Öffnen des Abschnitts: Kasten zu, ohne Fokus zu verschieben. */
  function reset() {
    setError("");
    setTippfehler(null);
    setRefocus(false);
    setOpen(false);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await requestEmailChange(formData);
        if (result.success) {
          setSentTo(result.pendingEmail ?? null);
          setRefocus(true);
          setOpen(false);
          toast.success("Bestätigungslink verschickt. Bitte prüfe dein Postfach.");
        } else {
          setError(result.error || "Die Änderung konnte nicht gestartet werden.");
        }
      } catch {
        setError("Die Änderung konnte nicht gestartet werden. Bitte versuch es noch einmal.");
      }
    });
  }

  return { formId, linkId, open, error, tippfehler, setTippfehler, pending, waitingFor, show, hide, reset, submit };
}

/**
 * E-Mail im Bearbeiten: grau gesperrtes Feld, rechts in der Beschriftungszeile „E-Mail ändern“. Der Link öffnet
 * darunter einen abgesetzten Kasten mit der neuen Adresse; dessen Felder gehören zum eigenen E-Mail-Formular.
 */
function EmailEditField({ id, currentEmail, email }: { id: string; currentEmail: string; email: EmailChange }) {
  const inputId = `${id}-email`;
  const newId = `${id}-email-neu`;
  const hintId = `${id}-email-hinweis`;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Escape schließt nur den Kasten, nicht das ganze Formular.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      email.hide();
    }
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={inputId}>E-Mail</FieldLabel>
        {!email.open && (
          <button
            id={email.linkId}
            type="button"
            onClick={email.show}
            className="-my-2.5 rounded-sm py-2.5 text-[0.8125rem] font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            E-Mail ändern
          </button>
        )}
      </div>
      <Input
        id={inputId}
        value={currentEmail}
        readOnly
        aria-describedby={email.waitingFor ? hintId : undefined}
        className="cursor-not-allowed bg-muted text-muted-foreground focus-visible:border-input focus-visible:ring-0 dark:bg-muted"
      />
      {email.waitingFor && <PendingEmailHint id={hintId} address={email.waitingFor} />}
      {email.open && (
        <div
          role="group"
          aria-labelledby={`${newId}-label`}
          onKeyDown={onKeyDown}
          data-reveal="fade"
          style={{ "--reveal-delay": "0s" } as CSSProperties}
          className="mt-1.5 flex flex-col gap-2 rounded-xl border border-border bg-background p-3.5"
        >
          <FieldLabel id={`${newId}-label`} htmlFor={newId}>
            Neue E-Mail-Adresse
          </FieldLabel>
          <Input
            id={newId}
            form={email.formId}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="neue@adresse.de"
            required
            autoFocus
            onChange={(e) => email.setTippfehler(emailTippfehler(e.target.value))}
          />
          <FeldHinweis>{email.tippfehler}</FeldHinweis>
          <p className="text-xs leading-normal text-muted-foreground">
            Wir schicken dir einen Bestätigungslink. Erst danach gilt die neue Adresse, auch für den Login.
          </p>
          {email.error && (
            <p role="alert" className="text-sm text-destructive">
              {email.error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-10 sm:h-9" onClick={email.hide} disabled={email.pending}>
              Abbrechen
            </Button>
            <Button type="submit" form={email.formId} className="h-10 sm:h-9" disabled={email.pending}>
              {email.pending ? "Wird gesendet…" : "Bestätigungslink senden"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BankSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id);
  const [iban, setIban] = useState(() => ibanInViererbloecken(profile.iban));
  const [bic, setBic] = useState(profile.bic);
  const f = editor.fehler;
  const hinweis = bicLandHinweis(iban, bic);

  function open() {
    setIban(ibanInViererbloecken(profile.iban));
    setBic(profile.bic);
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
          {(profile.iban || profile.bic) && (
            <Row
              label="BIC"
              value={
                profile.bic ? (
                  <>
                    <span className="block">{profile.bic}</span>
                    {profile.bicHinweis && (
                      <span className="mt-0.5 block font-sans text-xs font-normal tracking-normal text-muted-foreground">
                        {profile.bicHinweis}
                      </span>
                    )}
                  </>
                ) : null
              }
              mono
            />
          )}
          {profile.iban && profile.zahltBeitrag && (
            <>
              <Row label="Zahlungsweise" value="SEPA-Lastschrift" />
              <Row label="Mandat vom" value={profile.mandatVom} numeric />
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
          <Field id={`${id}-bic`} label="BIC (optional)" fehler={f.bic}>
            <Input
              id={`${id}-bic`}
              name="bic"
              value={bic}
              onChange={(e) => {
                setBic(e.target.value);
                editor.clear("bic");
              }}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              className="font-mono tracking-wide"
              {...invalid(`${id}-bic`, f.bic)}
            />
            {!f.bic && <FeldHinweis>{hinweis}</FeldHinweis>}
          </Field>
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
