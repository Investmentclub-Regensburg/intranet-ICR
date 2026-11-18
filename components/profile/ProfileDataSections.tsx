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
import { Landmark, MailCheck, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReadField, ReadSection } from "@/components/kit/ReadSection";
import { requestEmailChange, updateProfile } from "@/app/(intranet)/profile/actions";
import { maskIban } from "@/components/profile/profile-format";
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
  /** Name des Landes für die Anzeige, leer bei Deutschland. */
  landName: string;
  /** Handy für die Eingabe aufgeteilt (Altwerte: DE + roh). */
  handyLand: string;
  handyNummer: string;
  /** Handy für die Anzeige (international formatiert, Altwerte roh). */
  handyAnzeige: string;
  /** Kein Geburtsdatum gespeichert: das Mitglied darf es einmal selbst nachtragen. */
  geburtsdatumFehlt: boolean;
  /** Alumni zahlen keinen Beitrag: IBAN nicht Pflicht. */
  alumni: boolean;
  iban: string;
  bic: string;
  /** Nicht blockierender Hinweis zur BIC (Land weicht ab), sonst null. */
  bicHinweis: string | null;
  /** Version der verschlüsselten Zeile beim Laden (0 = keine): optimistische Sperre beim Speichern. */
  version: number;
};

type Fehler = Partial<Record<string, string>>;

/**
 * Persönliche Daten und Bankverbindung: erst Lesesicht (ReadSection), der Stift öffnet das Formular des
 * jeweiligen Abschnitts. Gespeichert wird über updateProfile; der Server prüft nach lib/member-rules.ts nur
 * die Felder des Abschnitts (`section`) und meldet Fehler je Feld. Nach dem Speichern zeichnet sich ein Haken.
 */
export function ProfileDataSections({ profile }: { profile: ProfileContactData }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <PersonalSection profile={profile} />
      <BankSection profile={profile} />
    </div>
  );
}

function PersonalSection({ profile }: { profile: ProfileContactData }) {
  const id = useId();
  const editor = useSectionEditor(id);
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

  return (
    <div id={id}>
      {editor.editing ? (
        <EditCard title="Persönliche Daten" Icon={UserRound}>
          {editor.saved ? (
            <GespeichertHaken text="Persönliche Daten gespeichert" onFertig={editor.close} />
          ) : (
            <EditForm editor={editor}>
              <input type="hidden" name="section" value="personal" />
              <input type="hidden" name="version" value={profile.version} />
              <div className="grid grid-cols-[1fr_6.5rem] gap-3 sm:gap-4">
                <Field id={`${id}-strasse`} label="Straße" fehler={f.strasse}>
                  <Input id={`${id}-strasse`} name="strasse" defaultValue={profile.strasse} autoComplete="address-line1" autoFocus {...invalid(`${id}-strasse`, f.strasse)} onInput={() => editor.clear("strasse")} />
                </Field>
                <Field id={`${id}-hausnummer`} label="Hausnr." fehler={f.hausnummer}>
                  <Input id={`${id}-hausnummer`} name="hausnummer" defaultValue={profile.hausnummer} {...invalid(`${id}-hausnummer`, f.hausnummer)} onInput={() => editor.clear("hausnummer")} />
                </Field>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-land`} className="text-xs font-medium text-muted-foreground">
                  Land
                </Label>
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
              <div className="grid grid-cols-[6.5rem_1fr] gap-3 sm:gap-4">
                <Field id={`${id}-plz`} label="PLZ" fehler={f.plz}>
                  <Input id={`${id}-plz`} name="plz" defaultValue={profile.plz} autoComplete="postal-code" inputMode={plzInputMode(land)} {...invalid(`${id}-plz`, f.plz)} onInput={() => editor.clear("plz")} />
                </Field>
                <Field id={`${id}-ort`} label="Ort" fehler={f.ort}>
                  <Input id={`${id}-ort`} name="ort" defaultValue={profile.ort} autoComplete="address-level2" {...invalid(`${id}-ort`, f.ort)} onInput={() => editor.clear("ort")} />
                </Field>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-handy`} className="text-xs font-medium text-muted-foreground">
                  Handynummer
                </Label>
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
              {profile.geburtsdatumFehlt && (
                <Field id={`${id}-geburtsdatum`} label="Geburtsdatum" fehler={f.geburtsdatum}>
                  <Input
                    id={`${id}-geburtsdatum`}
                    name="geburtsdatum"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    autoComplete="bday"
                    {...invalid(`${id}-geburtsdatum`, f.geburtsdatum)}
                    onInput={() => editor.clear("geburtsdatum")}
                  />
                </Field>
              )}
              <p className="text-xs text-muted-foreground">
                {profile.geburtsdatumFehlt
                  ? "Das Geburtsdatum kannst du einmal eintragen, danach ändert es der Vorstand. Den Namen ändert der Vorstand."
                  : "Den Namen und das Geburtsdatum ändert der Vorstand."}
              </p>
            </EditForm>
          )}
        </EditCard>
      ) : (
        <ReadSection title="Persönliche Daten" Icon={UserRound} onEdit={open}>
          <ReadField label="Name" value={name} />
          <EmailField email={profile.email} pendingEmail={profile.pendingEmail} />
          <ReadField
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
          <ReadField label="Handynummer" value={profile.handyAnzeige} />
          {profile.geburtsdatumFehlt && <ReadField label="Geburtsdatum" value={null} empty="Noch nicht eingetragen" />}
        </ReadSection>
      )}
    </div>
  );
}

/** aria-Attribute eines Felds mit Fehler. */
function invalid(id: string, fehler?: string) {
  return fehler ? { "aria-invalid": true as const, "aria-describedby": `${id}-fehler` } : {};
}

/**
 * E-Mail mit eigenem kleinen Formular: Die Änderung gilt erst nach dem Klick auf den Link in der
 * Bestätigungsmail (Supabase); bis dahin steht die neue Adresse als „ausstehend“ darunter.
 */
function EmailField({ email, pendingEmail }: { email: string; pendingEmail: string | null }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tippfehler, setTippfehler] = useState<string | null>(null);
  const waitingFor = sentTo ?? (pendingEmail && pendingEmail !== email ? pendingEmail : null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await requestEmailChange(formData);
        if (result.success) {
          setSentTo(result.pendingEmail ?? null);
          setEditing(false);
          toast.success("Bestätigungslink verschickt. Bitte prüfe dein Postfach.");
        } else {
          setError(result.error || "Die Änderung konnte nicht gestartet werden.");
        }
      } catch {
        setError("Die Änderung konnte nicht gestartet werden. Bitte versuch es noch einmal.");
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape" && !pending) {
      e.preventDefault();
      setEditing(false);
    }
  }

  return (
    <ReadField label="E-Mail">
      <span className="block break-all">{email}</span>
      {waitingFor && !editing && (
        <span className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MailCheck className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            Neue Adresse <span className="font-medium break-all text-foreground">{waitingFor}</span> wartet auf Bestätigung.
            Bitte den Link in der E-Mail anklicken.
          </span>
        </span>
      )}
      {editing ? (
        <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="mt-2 space-y-2">
          <Label htmlFor={`${id}-email`} className="sr-only">
            Neue E-Mail-Adresse
          </Label>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="neue@adresse.de"
            required
            autoFocus
            onChange={(e) => setTippfehler(emailTippfehler(e.target.value))}
          />
          <FeldHinweis>{tippfehler}</FeldHinweis>
          <p className="text-xs text-muted-foreground">
            Wir schicken dir einen Bestätigungslink. Erst danach gilt die neue Adresse, auch für den Login.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Wird gesendet…" : "Bestätigungslink senden"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 h-auto p-0 text-xs"
          onClick={() => {
            setError("");
            setEditing(true);
          }}
        >
          E-Mail ändern
        </Button>
      )}
    </ReadField>
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

  return (
    <div id={id}>
      {editor.editing ? (
        <EditCard title="Bankverbindung" Icon={Landmark}>
          {editor.saved ? (
            <GespeichertHaken text="Bankverbindung gespeichert" onFertig={editor.close} />
          ) : (
            <EditForm editor={editor}>
              <input type="hidden" name="section" value="bank" />
              <input type="hidden" name="version" value={profile.version} />
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-iban`} className="text-xs font-medium text-muted-foreground">
                  IBAN
                </Label>
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
        </EditCard>
      ) : (
        // Nur die letzten 4 Stellen der IBAN zeigen.
        <ReadSection title="Bankverbindung" Icon={Landmark} onEdit={open}>
          <ReadField label="IBAN" value={profile.iban ? maskIban(profile.iban) : null} mono />
          <ReadField
            label="BIC"
            value={
              profile.bic ? (
                <>
                  <span className="block">{profile.bic}</span>
                  {profile.bicHinweis && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{profile.bicHinweis}</span>
                  )}
                </>
              ) : null
            }
          />
        </ReadSection>
      )}
    </div>
  );
}

/** Rahmen des geöffneten Formulars, gleicher Kopf wie ReadSection (dort ist der Inhalt fest eine Liste). */
function EditCard({ title, Icon, children }: { title: string; Icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="mb-4 flex min-h-6 items-center gap-2 text-base leading-tight font-bold tracking-[-0.02em]">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
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
      className="space-y-4"
    >
      {children}
      {editor.error && (
        <p role="alert" className="text-sm text-destructive">
          {editor.error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={editor.cancel} disabled={editor.pending}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={editor.pending}>
          {editor.pending ? "Speichern…" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
