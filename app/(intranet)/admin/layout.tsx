import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { VerwaltungTabs } from "@/components/admin/VerwaltungTabs";

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

  // Bereich „Verwaltung“: TabBar statt Seitenüberschrift (Muster Tenant-Dashboard).
  return (
    <div className="space-y-8">
      <VerwaltungTabs role={role} />
      <div>{children}</div>
    </div>
  );
}
