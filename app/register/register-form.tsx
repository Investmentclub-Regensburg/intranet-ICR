"use client";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth-messages";

import { useActionState, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import {
  ArrowRight,
  CircleCheck,
  ClipboardCheck,
  GraduationCap,
  Info,
  KeyRound,
  Landmark,
  Mail,
  MapPin,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/kit/PasswordInput";
import { Label } from "@/components/ui/label";
import {
  registerAction,
  type RegisterActionState,
  type RegisterSavedState,
} from "./actions";
import { countryCodes } from "@/lib/country-codes";
import { IbanBicFields } from "./iban-bic-fields";
import { AuthFrame, StageHeading, flyDelay } from "@/components/auth/AuthFrame";
import {
  PickTile,
  WizardNav,
  WizardProgress,
  WizardStep,
  WizardSummary,
  firstInvalidField,
  reportStepValidity,
  useWizard,
  type WizardRow,
} from "@/components/kit/Wizard";
import { cn } from "@/lib/utils";

// Mitgliedsantrag als Wizard (Muster Tenant-Dashboard): pro Schritt eine Frage, jede
// Antwort landet als Zeile in der Zusammenfassung auf der roten Markenfläche, ein Klick darauf
// springt zurück. Felder, Namen, Werte, Prüfungen und Server Action sind dieselben wie im
// bisherigen einseitigen Formular: Alle Schritte bleiben im Formular (nur ausgeblendet)
// und werden zusammen an registerAction gesendet.

const initialState: RegisterActionState = {
  error: "",
  redirect: undefined,
  saved: undefined,
  confirmationMessage: undefined,
};

const DEFAULT_FORM: RegisterSavedState = {
  vorname: "",
  nachname: "",
  email: "",
  geburtstag: "",
  strasse: "",
  hausnummer: "",
  ort: "",
  plz: "",
  landesvorwahl: "+49",
  handynummer: "",
  student: "",
  studiengang: "",
  abschluss: "",
  semester: "",
  iban: "",
  bic: "",
  hochschultyp: "",
  sepa: false,
};

const STEPS = [
  { key: "person", label: "Name", Icon: UserRound },
  { key: "address", label: "Adresse", Icon: MapPin },
  { key: "contact", label: "Kontakt", Icon: Mail },
  { key: "password", label: "Passwort", Icon: KeyRound },
  { key: "study", label: "Studium", Icon: GraduationCap },
  { key: "bank", label: "Bankverbindung", Icon: Landmark },
  { key: "check", label: "Prüfen", Icon: ClipboardCheck },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const HOCHSCHULEN = [
  { value: "Universität Regensburg", label: "Universität Regensburg" },
  { value: "Ostbayerische Technische Hochschule", label: "Ostbayerische Technische Hochschule" },
  { value: "sonstige", label: "Sonstige" },
];

const FIELD_CLASS = "h-11";
const SELECT_CLASS =
  "flex h-11 rounded-xs border border-input bg-card px-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15";

function Field({ id, label, className, children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/** Turnstile erst im letzten Schritt (sichtbar, wie bisher am Formularende). Verlässt man
 *  den Schritt, verfällt das Token; beim Zurückkommen löst das Widget neu. */
function TurnstileGate({
  siteKey,
  isDevelopment,
  onToken,
}: {
  siteKey: string;
  isDevelopment: boolean;
  onToken: (token: string | null) => void;
}) {
  useEffect(() => () => onToken(isDevelopment ? "localhost-bypass" : null), [isDevelopment, onToken]);
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onExpire={() => onToken(null)}
      onError={() => isDevelopment && onToken("localhost-bypass")}
      options={{ theme: "light", size: "normal" }}
    />
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [formValues, setFormValues] = useState<RegisterSavedState>(DEFAULT_FORM);
  /** Nur für die Zusammenfassung: IBAN/BIC leben in IbanBicFields. */
  const [bankPreview, setBankPreview] = useState({ iban: "", bic: "" });
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const isDevelopment = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (state.redirect) {
      router.push(state.redirect);
      router.refresh();
    }
  }, [state.redirect, router]);

  useEffect(() => {
    if (!state.saved) return;

    const timeoutId = window.setTimeout(() => {
      setFormValues(state.saved ?? DEFAULT_FORM);
      setBankPreview({ iban: state.saved?.iban ?? "", bic: state.saved?.bic ?? "" });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [state.saved]);

  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    isDevelopment ? "localhost-bypass" : null
  );
  const passwordRepeatRef = useRef<HTMLInputElement>(null);
  const canSubmit =
    (isDevelopment && turnstileToken === "localhost-bypass") ||
    Boolean(turnstileSiteKey && turnstileToken);

  const checkPasswordMatch = useCallback((pwd: string, repeat: string) => {
    const mismatch = repeat.length > 0 && pwd !== repeat;
    setPasswordMismatch(mismatch);
    passwordRepeatRef.current?.setCustomValidity(
      mismatch ? "Die Passwörter stimmen nicht überein." : ""
    );
  }, []);

  // ── Wizard ──────────────────────────────────────────────────────────────
  const formRef = useRef<HTMLFormElement>(null);
  const wizard = useWizard(STEPS);
  const { step, direction } = wizard;
  /** Schritt, dessen Fehlermeldung nach dem Sprung angezeigt werden soll. */
  const reportAfterJumpRef = useRef<StepKey | null>(null);

  useEffect(() => {
    if (reportAfterJumpRef.current === step) {
      reportAfterJumpRef.current = null;
      reportStepValidity(formRef.current, step);
    }
  }, [step]);

  /** Weiter: erst die Felder des Schritts prüfen (gleiche Regeln wie bisher beim Absenden). */
  const handleNext = () => {
    // Fokus lösen, damit Prüfungen beim Verlassen eines Felds (IBAN/BIC) laufen.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (!reportStepValidity(formRef.current, step)) return;
    wizard.complete();
  };

  /** Absenden: Ist irgendwo noch etwas ungültig, dorthin springen statt zu senden. */
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    for (const s of STEPS) {
      const scope = formRef.current?.querySelector(`[data-wizard-step="${s.key}"]`) ?? null;
      if (!firstInvalidField(scope)) continue;
      e.preventDefault();
      if (s.key === step) {
        reportStepValidity(formRef.current, s.key);
      } else {
        reportAfterJumpRef.current = s.key;
        wizard.goTo(s.key);
      }
      return;
    }
  };

  const setField = <K extends keyof RegisterSavedState>(key: K, value: RegisterSavedState[K]) =>
    setFormValues((f) => ({ ...f, [key]: value }));

  // ── Zusammenfassung: eine Zeile je erledigtem Schritt ───────────────────
  const v = formValues;
  const done = (key: StepKey) => wizard.completed.includes(key);
  const rows: WizardRow<StepKey>[] = [];
  if (done("person")) {
    rows.push({
      key: "person",
      label: "Name",
      Icon: UserRound,
      value: `${v.vorname} ${v.nachname}${v.geburtstag ? `, geb. ${formatDate(v.geburtstag)}` : ""}`,
    });
  }
  if (done("address")) {
    rows.push({
      key: "address",
      label: "Adresse",
      Icon: MapPin,
      value: `${v.strasse} ${v.hausnummer}, ${v.plz} ${v.ort}`,
    });
  }
  if (done("contact")) {
    rows.push({
      key: "contact",
      label: "Kontakt",
      Icon: Mail,
      value: `${v.email} · ${v.landesvorwahl} ${v.handynummer}`,
    });
  }
  if (done("password")) {
    rows.push({ key: "password", label: "Passwort", Icon: KeyRound, value: "Festgelegt" });
  }
  if (done("study")) {
    const hochschule = v.hochschultyp === "sonstige" ? "andere Hochschule" : v.hochschultyp;
    rows.push({
      key: "study",
      label: "Studium",
      Icon: GraduationCap,
      value:
        v.student === "Ja"
          ? `${v.studiengang} (${v.abschluss}), ${v.semester}. Semester, ${hochschule}`
          : "Kein Studium",
    });
  }
  if (done("bank")) {
    rows.push({
      key: "bank",
      label: "Bankverbindung",
      Icon: Landmark,
      value: `${formatIban(bankPreview.iban)}${bankPreview.bic ? ` · ${bankPreview.bic}` : ""}`,
    });
  }

  const currentStep = STEPS[wizard.index];
  const stage = (
    // flex/gap statt space-y: die auf dem Handy ausgeblendete Zusammenfassung lässt dann keinen Abstand stehen.
    <div className="flex flex-col gap-8">
      <StageHeading eyebrow="Mitgliedsantrag" title="Jetzt Mitglied werden" />
      {!state.confirmationMessage && (
        <>
          <div className="fly-rise" style={flyDelay(0.42)}>
            <WizardProgress tone="onBrand" count={wizard.count} index={wizard.index} label={currentStep.label} />
          </div>
          {rows.length > 0 && (
            <WizardSummary
              tone="onBrand"
              rows={rows}
              activeKey={step}
              onSelect={wizard.goTo}
              className="-mx-3 hidden lg:block"
            />
          )}
        </>
      )}
    </div>
  );

  if (state.confirmationMessage) {
    return (
      <AuthFrame stage={stage} width="wide">
        <div className="fly-stack space-y-5" role="status">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-primary">
            <CircleCheck className="size-6" aria-hidden />
          </span>
          <h2 className="text-2xl font-bold tracking-[-0.03em]">Registrierung eingegangen</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{state.confirmationMessage}</p>
          <Button asChild variant="outline">
            <Link href="/login">Zum Login</Link>
          </Button>
        </div>
      </AuthFrame>
    );
  }

  const stepProps = (key: StepKey) => ({ stepKey: key, active: step === key, direction });

  return (
    <AuthFrame stage={stage} width="wide">
      <form
        ref={formRef}
        action={formAction}
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          // Enter in einem Feld führt zum nächsten Schritt, abgesendet wird nur über den Knopf.
          if (e.key !== "Enter" || step === "check") return;
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
            e.preventDefault();
            handleNext();
          }
        }}
        onChange={(e) => {
          const t = e.target;
          if (t instanceof HTMLInputElement && (t.name === "iban" || t.name === "bic")) {
            setBankPreview((b) => ({ ...b, [t.name]: t.value.replace(/\s/g, "").toUpperCase() }));
          }
        }}
        className="space-y-8"
      >
        {/* 1 Name */}
        <WizardStep {...stepProps("person")} title="Wie heißt du?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="vorname" label="Vorname">
              <Input
                id="vorname"
                name="vorname"
                type="text"
                placeholder="Max"
                required
                autoComplete="given-name"
                className={FIELD_CLASS}
                value={v.vorname}
                onChange={(e) => setField("vorname", e.target.value)}
              />
            </Field>
            <Field id="nachname" label="Nachname">
              <Input
                id="nachname"
                name="nachname"
                type="text"
                placeholder="Mustermann"
                required
                autoComplete="family-name"
                className={FIELD_CLASS}
                value={v.nachname}
                onChange={(e) => setField("nachname", e.target.value)}
              />
            </Field>
          </div>
          <Field id="geburtstag" label="Geburtstag">
            <Input
              id="geburtstag"
              name="geburtstag"
              type="date"
              required
              max={new Date().toISOString().split("T")[0]}
              autoComplete="bday"
              className={cn(FIELD_CLASS, "sm:w-1/2")}
              value={v.geburtstag}
              onChange={(e) => setField("geburtstag", e.target.value)}
            />
          </Field>
          <WizardNav>
            <Button type="button" size="lg" onClick={handleNext}>
              Weiter
              <ArrowRight aria-hidden />
            </Button>
          </WizardNav>
        </WizardStep>

        {/* 2 Adresse */}
        <WizardStep {...stepProps("address")} title="Wo wohnst du?">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="strasse" label="Straße">
              <Input
                id="strasse"
                name="strasse"
                type="text"
                placeholder="Musterstraße"
                required
                autoComplete="street-address"
                className={FIELD_CLASS}
                value={v.strasse}
                onChange={(e) => setField("strasse", e.target.value)}
              />
            </Field>
            <Field id="hausnummer" label="Hausnummer">
              <Input
                id="hausnummer"
                name="hausnummer"
                type="text"
                placeholder="42"
                required
                className={FIELD_CLASS}
                value={v.hausnummer}
                onChange={(e) => setField("hausnummer", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field id="plz" label="PLZ">
              <Input
                id="plz"
                name="plz"
                type="text"
                placeholder="80331"
                required
                autoComplete="postal-code"
                className={FIELD_CLASS}
                value={v.plz}
                onChange={(e) => setField("plz", e.target.value)}
              />
            </Field>
            <Field id="ort" label="Ort">
              <Input
                id="ort"
                name="ort"
                type="text"
                placeholder="München"
                required
                autoComplete="address-level2"
                className={FIELD_CLASS}
                value={v.ort}
                onChange={(e) => setField("ort", e.target.value)}
              />
            </Field>
          </div>
          <WizardNav onBack={wizard.back}>
            <Button type="button" size="lg" onClick={handleNext}>
              Weiter
              <ArrowRight aria-hidden />
            </Button>
          </WizardNav>
        </WizardStep>

        {/* 3 Kontakt */}
        <WizardStep {...stepProps("contact")} title="Wie erreichen wir dich?">
          <Field id="email" label="E-Mail">
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@beispiel.de"
              required
              autoComplete="email"
              className={FIELD_CLASS}
              value={v.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </Field>
          <Field id="handynummer" label="Handynummer">
            <div className="flex gap-2">
              <select
                id="landesvorwahl"
                name="landesvorwahl"
                value={v.landesvorwahl}
                onChange={(e) => setField("landesvorwahl", e.target.value)}
                className={cn(SELECT_CLASS, "w-28 shrink-0")}
                aria-label="Ländervorwahl"
              >
                {countryCodes.map(({ code, dialCode }) => (
                  <option key={code} value={dialCode}>
                    {dialCode} {code}
                  </option>
                ))}
              </select>
              <Input
                id="handynummer"
                name="handynummer"
                type="tel"
                placeholder="171 1234567"
                required
                autoComplete="tel-national"
                className={cn(FIELD_CLASS, "flex-1")}
                value={v.handynummer}
                onChange={(e) => setField("handynummer", e.target.value)}
              />
            </div>
          </Field>
          <WizardNav onBack={wizard.back}>
            <Button type="button" size="lg" onClick={handleNext}>
              Weiter
              <ArrowRight aria-hidden />
            </Button>
          </WizardNav>
        </WizardStep>

        {/* 4 Passwort */}
        <WizardStep {...stepProps("password")} title="Wähle dein Passwort">
          <Field id="password" label="Passwort">
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-hint"
              className={FIELD_CLASS}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                checkPasswordMatch(e.target.value, passwordRepeat);
              }}
            />
            <p id="password-hint" className="text-xs text-muted-foreground">
              Mindestens {MIN_PASSWORD_LENGTH} Zeichen.
            </p>
          </Field>
          <Field id="passwordRepeat" label="Passwort wiederholen">
            <PasswordInput
              ref={passwordRepeatRef}
              id="passwordRepeat"
              name="passwordRepeat"
              required
              autoComplete="new-password"
              value={passwordRepeat}
              onChange={(e) => {
                setPasswordRepeat(e.target.value);
                checkPasswordMatch(password, e.target.value);
              }}
              className={cn(FIELD_CLASS, passwordMismatch && "border-destructive")}
              aria-invalid={passwordMismatch}
              aria-describedby={passwordMismatch ? "password-error" : undefined}
            />
            {passwordMismatch && (
              <p id="password-error" className="text-sm text-destructive" role="alert">
                Die Passwörter stimmen nicht überein.
              </p>
            )}
          </Field>
          <WizardNav onBack={wizard.back}>
            <Button type="button" size="lg" onClick={handleNext}>
              Weiter
              <ArrowRight aria-hidden />
            </Button>
          </WizardNav>
        </WizardStep>

        {/* 5 Studium */}
        <WizardStep {...stepProps("study")} title="Studierst du?">
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Student">
            <PickTile
              name="student"
              value="Ja"
              required
              label="Ja, ich studiere"
              Icon={GraduationCap}
              checked={v.student === "Ja"}
              onChange={() => setField("student", "Ja")}
            />
            <PickTile
              name="student"
              value="Nein"
              required
              label="Nein"
              Icon={UserRound}
              checked={v.student === "Nein"}
              onChange={() => {
                setFormValues((f) => ({
                  ...f,
                  student: "Nein",
                  studiengang: "",
                  abschluss: "",
                  semester: "",
                  hochschultyp: "",
                }));
                // Auswahl springt von selbst weiter (Muster Tenant-Dashboard).
                window.setTimeout(() => wizard.complete("study"), 220);
              }}
            />
          </div>
          {v.student === "Ja" && (
            <div className="space-y-4">
              <Field id="studiengang" label="Studiengang / Fach">
                <Input
                  id="studiengang"
                  name="studiengang"
                  type="text"
                  placeholder="z.B. Informatik"
                  required
                  className={FIELD_CLASS}
                  value={v.studiengang}
                  onChange={(e) => setField("studiengang", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <Field id="abschluss" label="Angestrebter Abschluss">
                  <Input
                    id="abschluss"
                    name="abschluss"
                    type="text"
                    placeholder="z.B. Bachelor, Master"
                    required
                    className={FIELD_CLASS}
                    value={v.abschluss}
                    onChange={(e) => setField("abschluss", e.target.value)}
                  />
                </Field>
                <Field id="semester" label="Aktuelles Semester">
                  <Input
                    id="semester"
                    name="semester"
                    type="text"
                    inputMode="numeric"
                    placeholder="z.B. 3"
                    required
                    className={FIELD_CLASS}
                    value={v.semester}
                    onChange={(e) => setField("semester", e.target.value)}
                  />
                </Field>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Uni oder Hochschule</legend>
                <div className="grid gap-2">
                  {HOCHSCHULEN.map((h) => (
                    <PickTile
                      key={h.value}
                      name="hochschultyp"
                      value={h.value}
                      required
                      label={h.label}
                      checked={v.hochschultyp === h.value}
                      onChange={() => setField("hochschultyp", h.value)}
                      className="py-3"
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          <WizardNav onBack={wizard.back}>
            <Button type="button" size="lg" onClick={handleNext}>
              Weiter
              <ArrowRight aria-hidden />
            </Button>
          </WizardNav>
        </WizardStep>

        {/* 6 Bankverbindung + SEPA */}
        <WizardStep {...stepProps("bank")} title="Bankverbindung für den Beitrag">
          <div className="flex gap-3 rounded-xl border border-border bg-muted/60 p-4 text-sm leading-relaxed text-ink-soft">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              Dein erstes Semester ist kostenlos, dafür wird nichts eingezogen. Ab dem zweiten
              Semester buchen wir 15&nbsp;€ je Semester per SEPA-Lastschrift ab, halbjährlich im
              Voraus zum 01.04. und 01.10.
            </p>
          </div>
          <IbanBicFields initialIban={v.iban} initialBic={v.bic} />
          <PickTile
            type="checkbox"
            name="sepa"
            value="on"
            required
            label="Ich bestätige das SEPA-Lastschriftmandat für den ICR Mitgliedsbeitrag."
            checked={v.sepa}
            onChange={(e) => setField("sepa", e.target.checked)}
          />
          <WizardNav onBack={wizard.back}>
            <Button type="button" size="lg" onClick={handleNext}>
              Weiter
              <ArrowRight aria-hidden />
            </Button>
          </WizardNav>
        </WizardStep>

        {/* 7 Prüfen und absenden */}
        <WizardStep {...stepProps("check")} title="Alles richtig?">
          <p className="text-sm text-muted-foreground">Ein Klick auf eine Angabe führt zurück zum Schritt.</p>
          {/* Auf dem Desktop steht die Zusammenfassung auf der Bühne links. */}
          <WizardSummary
            rows={rows}
            onSelect={wizard.goTo}
            className="rounded-2xl border border-border bg-card p-1 lg:hidden"
          />
          <p className="text-sm text-muted-foreground">
            Mit der Registrierung akzeptierst du die{" "}
            <Link
              href="/dokumente/vereinssatzung.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Vereinssatzung
            </Link>
            .
          </p>
          {state.error && (
            <p
              className="rounded-xs border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </p>
          )}
          {step === "check" && turnstileSiteKey ? (
            <TurnstileGate
              siteKey={turnstileSiteKey}
              isDevelopment={isDevelopment}
              onToken={setTurnstileToken}
            />
          ) : !turnstileSiteKey && !isDevelopment ? (
            <p className="text-sm text-destructive" role="alert">
              Registrierung ist aktuell nicht verfügbar. Bitte kontaktiere den Vorstand.
            </p>
          ) : null}
          <WizardNav onBack={wizard.back}>
            <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={!canSubmit || pending}>
              {pending ? "Wird gesendet …" : "Registrieren"}
            </Button>
          </WizardNav>
        </WizardStep>

        {isDevelopment && turnstileToken === "localhost-bypass" && (
          <input type="hidden" name="cf-turnstile-response" value="localhost-bypass" readOnly />
        )}
      </form>

      <p className="fly-rise mt-10 border-t border-border pt-6 text-sm text-muted-foreground" style={flyDelay(0.7)}>
        Bereits ein Konto?{" "}
        <Link href="/login" className="font-semibold text-primary transition-colors hover:text-foreground">
          Zum Login
        </Link>
      </p>
    </AuthFrame>
  );
}
