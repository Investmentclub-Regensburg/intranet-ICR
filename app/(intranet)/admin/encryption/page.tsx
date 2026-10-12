import { redirect } from "next/navigation";
import { requireRole } from "@/utils/supabase/guards";
import { EncryptionTools } from "@/components/admin/EncryptionTools";

/** Laufzeit je Server-Action-Aufruf (eine Portion Backfill). */
export const maxDuration = 60;

/** Verschlüsselung der Bestandsdaten (Phase 3, docs/verschluesselung.md). Nur Vorstand. */
export default async function AdminEncryptionPage() {
  const auth = await requireRole(["board"]);
  if (!auth.ok) redirect("/admin");
  return <EncryptionTools />;
}
