import { redirect } from "next/navigation";
import { PageHeader } from "@/components/kit/PageHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { isProfileTab } from "@/components/profile/tabs";
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
  membershipDuration,
  nextFeeStop,
} from "@/components/profile/profile-format";
import { getCachedAuth, getCachedSupabase } from "@/utils/supabase/cached-auth";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { user } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  const supabase = await getCachedSupabase();
  const [{ data: profile }, { data: alumniRow }, params] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    // Letzter eigener Alumni-Antrag mit Datum (RLS: nur eigene Zeilen), für die Status-Kachel.
    supabase
      .from("alumni_requests")
      .select("status, created_at, handled_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    searchParams,
  ]);

  const p = {
    vorname: ((profile?.["Vorname"] as string) ?? "").trim(),
    nachname: ((profile?.["Nachname"] as string) ?? "").trim(),
    email: user.email ?? "",
    rolle: ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase(),
    status: ((profile?.["Status"] as string) ?? "").trim().toLowerCase(),
    datumAntrag: (profile?.["Datum_Antrag"] as string | null) ?? null,
    strasse: ((profile?.["Straße"] as string) ?? "").trim(),
    hausnummer: ((profile?.["Hausnummer"] as string) ?? "").trim(),
    plz: ((profile?.["PLZ"] as string) ?? "").trim(),
    ort: ((profile?.["Ort"] as string) ?? "").trim(),
    mobil: ((profile?.["Handynummer"] as string) ?? "").trim(),
    iban: ((profile?.["IBAN"] as string) ?? "").trim(),
    bic: ((profile?.["BIC"] as string) ?? "").trim(),
  };

  const alumniStatus = String((alumniRow as { status?: unknown } | null)?.status ?? "").trim().toLowerCase();
  const alumni: AlumniInfo = {
    status:
      alumniStatus === "pending" || alumniStatus === "approved" || alumniStatus === "rejected"
        ? alumniStatus
        : "none",
    requestedAt: formatDate((alumniRow as { created_at?: string } | null)?.created_at),
    decidedAt: formatDate((alumniRow as { handled_at?: string | null } | null)?.handled_at),
  };

  const roleLabel = ROLE_LABELS[p.rolle] ?? p.rolle;
  // Leerer Status gilt in der App als aktiv (lib/profile-status: isActiveMemberProfile).
  const statusLabel = STATUS_LABELS[p.status] ?? (p.status || "Aktiv");
  const memberSince = formatDate(p.datumAntrag);
  // Alumni zahlen keinen Beitrag (der Finanzexport überspringt sie).
  const paysFee = p.rolle !== "alumni" && p.status !== "alumni";

  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = isProfileTab(tabParam) ? tabParam : "ueberblick";

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader title="Mein Profil" />
      <ProfileTabs
        initialTab={initialTab}
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
          daten: (
            <ProfileDataSections
              profile={{
                vorname: p.vorname,
                nachname: p.nachname,
                email: p.email,
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
              isCancelled={p.status === "cancelled"}
              statusLabel={statusLabel}
              since={memberSince}
              alumni={alumni}
              feeStop={paysFee ? nextFeeStop() : null}
            />
          ),
        }}
      />
    </div>
  );
}
