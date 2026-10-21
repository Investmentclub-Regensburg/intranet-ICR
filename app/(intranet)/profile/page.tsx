import { redirect } from "next/navigation";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ProfileOverview } from "@/components/profile/ProfileOverview";
import { ProfileDataSections } from "@/components/profile/ProfileDataSections";
import { MyEventsSection } from "@/components/profile/MyEventsSection";
import { MembershipSection } from "@/components/profile/MembershipSection";
import type { AlumniInfo } from "@/components/profile/AlumniStatusCard";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  formatDate,
  initials,
  maskIban,
  membershipDuration,
  nextFeeStop,
} from "@/components/profile/profile-format";
import { getCachedAuth, getCachedSupabase } from "@/utils/supabase/cached-auth";
import { createServiceClient } from "@/utils/supabase/service";
import { emptySecretValues, readMemberSecrets } from "@/lib/member-secrets-server";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const emailNotice = (await searchParams).email;
  const { user } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  const supabase = await getCachedSupabase();
  const [{ data: profile }, { data: alumniRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        'id, "Vorname", "Nachname", "Rolle", "Status", "Datum_Antrag", "Datum_Mandat"',
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
  ]);

  // Sensible Angaben nur aus member_secrets; ohne Zeile sind sie leer.
  // Nur die eigene Zeile (Profil-ID aus der eigenen, per RLS gelesenen Profilzeile).
  const profileId = String((profile as { id?: unknown } | null)?.id ?? "");
  // Kann eine vorhandene Zeile nicht gelesen werden: Hinweis statt Formular (leere Felder würden beim
  // Speichern die verschlüsselte Fassung überschreiben).
  let secrets: Awaited<ReturnType<typeof readMemberSecrets>> = null;
  let secretsUnavailable = false;
  if (profileId) {
    try {
      secrets = await readMemberSecrets(createServiceClient(), profileId);
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
    mobil: sensitive.handynummer ?? "",
    iban: sensitive.iban ?? "",
    bic: sensitive.bic ?? "",
  };

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
      {(emailNotice === "geaendert" || emailNotice === "ausstehend") && (
        <p role="status" className="rounded-2xl border border-border bg-card p-4 text-sm">
          {emailNotice === "geaendert"
            ? `Deine E-Mail-Adresse ist geändert. Ab sofort meldest du dich mit ${p.email} an.`
            : "Danke, ein Link ist bestätigt. Bitte bestätige die Änderung auch über den Link, den wir an deine andere Adresse geschickt haben."}
        </p>
      )}
      <ProfileTabs
        panels={{
          ueberblick: (
            <ProfileOverview
              data={{
                vorname: p.vorname,
                nachname: p.nachname,
                email: p.email,
                initials: initials(p.vorname, p.nachname),
                roleLabel,
                statusLabel,
                memberSince,
                duration: membershipDuration(p.datumAntrag),
              }}
            />
          ),
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
                pendingEmail: user.new_email ?? null,
                strasse: p.strasse,
                hausnummer: p.hausnummer,
                plz: p.plz,
                ort: p.ort,
                mobil: p.mobil,
                iban: p.iban,
                bic: p.bic,
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
                ibanMasked: maskIban(p.iban),
                mandateDate: formatDate(p.datumMandat),
              }}
            />
          ),
        }}
      />
    </div>
  );
}
