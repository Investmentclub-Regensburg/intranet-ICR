import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { VerwaltungTabs } from "@/components/admin/VerwaltungTabs";

// Insights gehört zum Bereich „Verwaltung“ (gleiche TabBar wie /admin/**). Die Rollen-
// prüfung (nur board) bleibt auf der Seite selbst.
export default async function InsightsLayout({ children }: { children: ReactNode }) {
  const { profile } = await getCachedAuth();
  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();

  if (role !== "board") return <>{children}</>;

  return (
    <div className="space-y-8">
      <VerwaltungTabs role={role} />
      <div>{children}</div>
    </div>
  );
}
