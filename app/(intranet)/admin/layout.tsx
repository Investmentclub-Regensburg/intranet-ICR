import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { VerwaltungHeader } from "@/components/admin/VerwaltungHeader";

export default async function AdminLayout({
  children,
}: { children: ReactNode }) {
  const { user, profile } = await getCachedAuth();

  if (!user) {
    redirect("/login");
  }

  const role = ((profile?.["Rolle"] as string) ?? "member").trim().toLowerCase();

  if (role !== "admin" && role !== "board") {
    redirect("/dashboard");
  }

  // Bereich „Verwaltung“: Unterseiten in der Sidebar, hier nur der Seitenkopf.
  return (
    <div className="space-y-8">
      <VerwaltungHeader role={role} />
      <div>{children}</div>
    </div>
  );
}
