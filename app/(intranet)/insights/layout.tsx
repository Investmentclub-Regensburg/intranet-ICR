import type { ReactNode } from "react";
import { sperreBeiDatenmaengeln } from "@/lib/member-data-check-sperre";

// Insights gehört zum Bereich „Verwaltung“. Den Kopf (Eyebrow „Verwaltung · Semester“, Titel, Reiter)
// zeichnet die Seite selbst, weil die Reiter rechts daneben stehen. Die Rollenprüfung (nur board) bleibt
// auf der Seite.
export default async function InsightsLayout({ children }: { children: ReactNode }) {
  await sperreBeiDatenmaengeln();
  return <>{children}</>;
}
