import { AreaHeader, VEREIN_TABS } from "@/components/area/AreaHeader";
import { MembersSearch } from "@/components/members/MembersSearch";

export default function MembersPage() {
  return (
    <div className="space-y-8">
      <AreaHeader
        title="Verein"
        tabs={VEREIN_TABS}
        activeKey="members"
        layoutId="tabs-verein"
        ariaLabel="Bereiche des Vereins"
      />
      <MembersSearch />
    </div>
  );
}
