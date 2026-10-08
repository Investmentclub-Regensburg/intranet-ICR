"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { IconButton } from "@/components/kit/IconButton";
import { createClient } from "@/utils/supabase/client";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <IconButton label="Abmelden" variant="danger" className={className} onClick={handleLogout}>
      <LogOut />
    </IconButton>
  );
}
