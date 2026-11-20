"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { IconButton } from "@/components/kit/IconButton";
import { logoutAction } from "@/app/login/actions";

export function LogoutButton({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  // Abmelden serverseitig (Server Action), danach leitet die Action zum Login weiter.
  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <IconButton label="Abmelden" variant="danger" className={className} onClick={handleLogout} disabled={isPending}>
      <LogOut />
    </IconButton>
  );
}
