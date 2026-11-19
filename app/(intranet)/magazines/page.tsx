import { PageHeader } from "@/components/kit/PageHeader";
import { Stagger } from "@/components/kit/Reveal";
import { BvhLoginSection } from "@/components/magazines/BvhLoginSection";
import { getBvhLoginStatusForCurrentUser } from "./actions";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

// Vorteile der Mitgliedschaft. Heute gibt es im Intranet genau einen (BVH-Zeitschriften);
// weitere kommen als eigene Abschnitte in diese Liste, sobald es sie wirklich gibt.
export default async function MagazinesPage() {
  await sperreBeiDatenmaengeln();
  const bvhStatus = await getBvhLoginStatusForCurrentUser();

  return (
    <div className="space-y-8">
      <PageHeader title="Vorteile" description="Was dir die Mitgliedschaft zusätzlich bringt." />

      <Stagger className="space-y-6">
        <BvhLoginSection initialStatus={bvhStatus} />
      </Stagger>
    </div>
  );
}
