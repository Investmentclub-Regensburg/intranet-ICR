"use client";

import { useSearchParams } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { PageHeader } from "@/components/kit/PageHeader";
import { PROFILE_TABS, profileTabFromParam, profileTabTitle, type ProfileTabKey } from "@/components/profile/tabs";

/**
 * Bereiche von „Mein Profil“. Gewählt wird in der Sidebar (aufgeklappt über der Nutzerzeile, Links auf
 * /profile?tab=…); hier stehen nur der Titel und der Inhalt (Skizze Profil.dc.html: keine Kopfkarte, keine
 * Reiter). Alle Bereiche werden auf dem Server gerendert und bleiben im DOM (offene Formulare behalten ihren
 * Stand), sichtbar ist nur der aktive; er blendet beim Wechsel neu ein (data-reveal).
 */
export function ProfileTabs({ panels }: { panels: Record<ProfileTabKey, ReactNode> }) {
  const active = profileTabFromParam(useSearchParams().get("tab"));

  return (
    <>
      <PageHeader key={active} title={profileTabTitle(active)} />
      <div>
        {PROFILE_TABS.map((t) => (
          <div
            key={t.key}
            role="region"
            aria-label={t.title}
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
