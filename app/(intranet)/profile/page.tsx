import { redirect } from "next/navigation";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ProfileDataSections } from "@/components/profile/ProfileDataSections";
import { MyEventsSection } from "@/components/profile/MyEventsSection";
import { MembershipSection } from "@/components/profile/MembershipSection";
import type { AlumniInfo } from "@/components/profile/AlumniStatusCard";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  formatDate,
  membershipDuration,
  nextFeeStop,
} from "@/components/profile/profile-format";
import { getCachedAuth, getCachedSupabase } from "@/utils/supabase/cached-auth";
import { createServiceClient } from "@/utils/supabase/service";
import { emptySecretValues, readMemberSecretsWithMeta, type MemberSecretValues } from "@/lib/member-secrets-server";
import { handyAnzeige, handyFuerEingabe, landAusBestand } from "@/lib/member-forms";
import { findCountry } from "@/lib/country-codes";
import { isAlumniProfile } from "@/lib/profile-status";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";
import { KEINE_AENDERUNG, emailHinweisAusParam } from "@/lib/email-change";
import { readEmailChange } from "./actions";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  await sperreBeiDatenmaengeln();
  const emailHinweis = emailHinweisAusParam((await searchParams).email);
  const { user } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  const supabase = await getCachedSupabase();
  const [{ data: profile }, { data: alumniRow }, emailAenderung] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        'id, "Vorname", "Nachname", "Rolle", "Status", "Datum_Antrag", "Datum_Mandat", "Studiengang / Fach"',
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    // Letzter eigener Alumni-Antrag mit Datum (RLS: nur eigene Zeilen), für die Status-Kachel.
    supabase
      .from("alumni_requests")
      .select("status, created_at, handled_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Stand einer E-Mail-Änderung (beide Postfächer) für das Fenster in Meine Daten.
    readEmailChange(),
  ]);

  // Sensible Angaben nur aus member_secrets; ohne Zeile sind sie leer.
  // Nur die eigene Zeile (Profil-ID aus der eigenen, per RLS gelesenen Profilzeile).
  const profileId = String((profile as { id?: unknown } | null)?.id ?? "");
  // Kann eine vorhandene Zeile nicht gelesen werden: Hinweis statt Formular (leere Felder würden beim
  // Speichern die verschlüsselte Fassung überschreiben).
  let secrets: MemberSecretValues | null = null;
  // Version der Zeile (0 = keine Zeile): das Formular schickt sie mit (optimistische Sperre).
  let secretsVersion = 0;
  let landUnbekannt = false;
  let secretsUnavailable = false;
  if (profileId) {
    try {
      const gelesen = await readMemberSecretsWithMeta(createServiceClient(), profileId);
      secrets = gelesen?.values ?? null;
      secretsVersion = gelesen?.version ?? 0;
      landUnbekannt = gelesen ? !gelesen.landBekannt : false;
    } catch (err) {
      console.error("ProfilePage: member_secrets", err instanceof Error ? err.message : "unbekannt");
      secretsUnavailable = true;
    }
  }
  const sensitive = secrets ?? emptySecretValues();

  const p = {
    vorname: ((profile?.["Vorname"] as string) ?? "").trim(),
    nachname: ((profile?.["Nachname"] as string) ?? "").trim(),
    email: user.email ?? "",
    rolle: ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase(),
    status: ((profile?.["Status"] as string) ?? "").trim().toLowerCase(),
    datumAntrag: (profile?.["Datum_Antrag"] as string | null) ?? null,
    datumMandat: (profile?.["Datum_Mandat"] as string | null) ?? null,
    strasse: sensitive.strasse ?? "",
    hausnummer: sensitive.hausnummer ?? "",
    plz: sensitive.plz ?? "",
    ort: sensitive.ort ?? "",
    land: landAusBestand(sensitive.land),
    mobil: sensitive.handynummer ?? "",
    iban: sensitive.iban ?? "",
    // Klartext in profiles; null/leer = nicht angegeben.
    studiengang: typeof profile?.["Studiengang / Fach"] === "string" ? (profile["Studiengang / Fach"] as string) : "",
  };
  const handy = handyFuerEingabe(sensitive.handynummer);

  const alumniStatus = String((alumniRow as { status?: unknown } | null)?.status ?? "").trim().toLowerCase();
  const alumni: AlumniInfo = {
    status:
      alumniStatus === "pending" || alumniStatus === "approved" || alumniStatus === "rejected"
        ? alumniStatus
        : "none",
    requestedAt: (alumniRow as { created_at?: string } | null)?.created_at ?? null,
    decidedAt: (alumniRow as { handled_at?: string | null } | null)?.handled_at ?? null,
  };

  const roleLabel = ROLE_LABELS[p.rolle] ?? p.rolle;
  // Leerer Status gilt in der App als aktiv (lib/profile-status: isActiveMemberProfile).
  const statusLabel = STATUS_LABELS[p.status] ?? (p.status || "Aktiv");
  const memberSince = formatDate(p.datumAntrag);
  // Alumni zahlen keinen Beitrag (der Finanzexport überspringt sie).
  const paysFee = p.rolle !== "alumni" && p.status !== "alumni";

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Ohne Datenbereich (dort sitzt das Fenster) bleibt der Hinweis aus dem Link in der Mail als Zeile. */}
      {secretsUnavailable && (emailHinweis === "geaendert" || emailHinweis === "bestaetigt") && (
        <p role="status" className="rounded-2xl border border-border bg-card p-4 text-sm">
          {emailHinweis === "geaendert"
            ? `Deine E-Mail-Adresse wurde geändert. Ab sofort meldest du dich mit ${p.email} an.`
            : "Danke, ein Link ist bestätigt. Bitte bestätige die Änderung auch über den Link, den wir an deine andere Adresse geschickt haben."}
        </p>
      )}
      <ProfileTabs
        panels={{
          daten: secretsUnavailable ? (
            <p role="alert" className="rounded-2xl border border-destructive/25 bg-card p-5 text-sm">
              Deine Adresse und Bankverbindung können gerade nicht angezeigt werden. Bitte versuche es später
              erneut oder wende dich an den Vorstand.
            </p>
          ) : (
            <ProfileDataSections
              profile={{
                vorname: p.vorname,
                nachname: p.nachname,
                email: p.email,
                pendingEmail: emailAenderung?.neueAdresse ?? null,
                emailStand: emailAenderung?.stand ?? KEINE_AENDERUNG,
                emailHinweis,
                strasse: p.strasse,
                hausnummer: p.hausnummer,
                plz: p.plz,
                ort: p.ort,
                land: p.land,
                landName: findCountry(p.land)?.name ?? p.land,
                handyLand: handy.land,
                handyNummer: handy.nummer,
                handyAnzeige: handyAnzeige(p.mobil),
                geburtsdatum: (sensitive.geburtsdatum ?? "").trim(),
                studiengang: p.studiengang,
                alumni: isAlumniProfile(profile as Record<string, unknown> | null),
                iban: p.iban,
                zahltBeitrag: paysFee,
                mandatVom: formatDate(p.datumMandat),
                version: secretsVersion,
                landUnbekannt,
              }}
            />
          ),
          veranstaltungen: <MyEventsSection />,
          mitgliedschaft: (
            <MembershipSection
              rolle={p.rolle}
              alumni={alumni}
              data={{
                roleLabel,
                statusLabel,
                statusVariant: p.status === "" || p.status === "active" || p.status === "alumni" ? "done" : "open",
                isCancelled: p.status === "cancelled",
                memberSince,
                duration: membershipDuration(p.datumAntrag),
                feeStop: paysFee ? nextFeeStop() : null,
              }}
            />
          ),
        }}
      />
    </div>
  );
}
