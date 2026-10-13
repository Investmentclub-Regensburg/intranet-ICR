import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { VerwaltungHeader } from "@/components/admin/VerwaltungHeader";

// Insights gehört zum Bereich „Verwaltung“ (gleicher Kopf wie /admin/**). Die Rollen-
// prüfung (nur board) bleibt auf der Seite selbst.
export default async function InsightsLayout({ children }: { children: ReactNode }) {
  const { profile } = await getCachedAuth();
  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();

  if (role !== "board") return <>{children}</>;

  return (
    <div className="space-y-8">
      <VerwaltungHeader role={role} />
      <div>{children}</div>
    </div>
  );
}
