import { AreaHeader } from "@/components/area/AreaHeader";
import { VEREIN_SECTIONS } from "@/components/layout/nav-sections";
import { MembersSearch } from "@/components/members/MembersSearch";

export default function MembersPage() {
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
