import { PageHeader } from "@/components/kit/PageHeader";
import { BvhLoginSection } from "@/components/magazines/BvhLoginSection";
import { getBvhLoginStatusForCurrentUser } from "./actions";

// Vorteile der Mitgliedschaft. Heute gibt es im Intranet genau einen (BVH-Zeitschriften);
// weitere kommen als eigene Abschnitte in diese Liste, sobald es sie wirklich gibt.
export default async function MagazinesPage() {
  const bvhStatus = await getBvhLoginStatusForCurrentUser();

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <PageHeader title="Vorteile" />
        <p className="fly-rise text-[0.9375rem] text-muted-foreground [--fly-delay:0.15s]">
          Was dir die Mitgliedschaft zusätzlich bringt.
        </p>
      </header>

      <div className="space-y-6">
        <BvhLoginSection initialStatus={bvhStatus} />
      </div>
    </div>
  );
}
