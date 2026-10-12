"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/kit/Segmented";

/** Umschalter auf der Mitgliederseite: Mitgliederliste oder Kündigungen (mit Gründen). */
export function MembersViewSwitch({
  members,
  cancellations,
  cancellationsCount,
}: {
  members: ReactNode;
  cancellations: ReactNode;
  cancellationsCount: number;
}) {
  const [view, setView] = useState<"members" | "cancellations">("members");
  return (
    <div className="space-y-5">
      <Segmented
        layoutId="members-view"
        ariaLabel="Ansicht"
        value={view}
        onChange={setView}
        options={[
          { key: "members", label: "Mitglieder" },
          { key: "cancellations", label: `Kündigungen (${cancellationsCount})` },
        ]}
      />
      {view === "members" ? members : cancellations}
    </div>
  );
}
