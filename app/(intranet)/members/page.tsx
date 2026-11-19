import { AreaHeader } from "@/components/area/AreaHeader";
import { VEREIN_SECTIONS } from "@/components/layout/nav-sections";
import { MembersSearch } from "@/components/members/MembersSearch";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

export default async function MembersPage() {
  await sperreBeiDatenmaengeln();
  return (
    <div className="space-y-8">
      <AreaHeader
        area="Verein"
        sections={VEREIN_SECTIONS}
      />
      <MembersSearch />
    </div>
  );
}
