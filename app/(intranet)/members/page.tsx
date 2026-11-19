import { AreaHeader } from "@/components/area/AreaHeader";
import { VEREIN_SECTIONS } from "@/components/layout/nav-sections";
import { MembersSearch } from "@/components/members/MembersSearch";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";
import { getAllMembers } from "./actions";

export default async function MembersPage() {
  await sperreBeiDatenmaengeln();
  const members = await getAllMembers();
  return (
    <div className="space-y-8">
      <AreaHeader
        area="Verein"
        sections={VEREIN_SECTIONS}
      />
      <MembersSearch members={members} />
    </div>
  );
}
