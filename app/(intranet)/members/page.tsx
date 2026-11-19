import { AreaHeader } from "@/components/area/AreaHeader";
import { VEREIN_SECTIONS } from "@/components/layout/nav-sections";
import { MembersSearch } from "@/components/members/MembersSearch";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";
import { getMemberDirectory } from "@/lib/member-directory-server";

export default async function MembersPage() {
  await sperreBeiDatenmaengeln();
  const verzeichnis = await getMemberDirectory();
  return (
    <div className="space-y-8">
      <AreaHeader
        area="Verein"
        sections={VEREIN_SECTIONS}
      />
      {"error" in verzeichnis ? (
        <p role="alert" className="rounded-2xl border border-dashed border-input bg-card px-6 py-12 text-center text-sm font-semibold text-foreground">
          {verzeichnis.error}
        </p>
      ) : (
        <MembersSearch members={verzeichnis.members} />
      )}
    </div>
  );
}
