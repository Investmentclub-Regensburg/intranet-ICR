"use client";

import { useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { PageHeader } from "@/components/kit/PageHeader";
import { PROFILE_TABS, isProfileTab, type ProfileTabKey } from "@/components/profile/tabs";

/**
 * Bereiche von „Mein Profil“. Gewählt wird in der Sidebar (aufgeklappt unter der
 * Nutzerzeile, Links auf /profile?tab=…); hier stehen nur Kopf und Inhalt. Alle
 * Bereiche werden auf dem Server gerendert und bleiben im DOM (offene Formulare
 * behalten ihren Stand), sichtbar ist nur der aktive; er blendet beim Wechsel neu
 * ein (data-reveal, Kacheln darin staffeln sich erneut).
 */
export function ProfileTabs({ panels }: { panels: Record<ProfileTabKey, ReactNode> }) {
  const param = useSearchParams().get("tab");
  const active: ProfileTabKey = isProfileTab(param) ? param : "ueberblick";
  const label = PROFILE_TABS.find((t) => t.key === active)?.label ?? "Mein Profil";

  return (
    <>
      <PageHeader eyebrow="Mein Profil" title={label} />
      <div>
        {PROFILE_TABS.map((t) => (
          <div
            key={t.key}
            role="region"
            aria-label={t.label}
            hidden={t.key !== active}
            data-reveal="fade"
            style={{ "--reveal-delay": "0s" } as CSSProperties}
          >
            {panels[t.key]}
          </div>
        ))}
      </div>
    </>
  );
}
