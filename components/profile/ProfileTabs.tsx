"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { TabBar } from "@/components/kit/TabBar";
import { PROFILE_TABS, isProfileTab, type ProfileTabKey } from "@/components/profile/tabs";

/**
 * Tabs für „Mein Profil“. Alle Bereiche werden auf dem Server gerendert und bleiben
 * im DOM (offene Formulare behalten ihren Stand), sichtbar ist nur der aktive; er
 * blendet beim Wechsel neu ein (data-reveal, Kacheln darin staffeln sich erneut).
 * Der Tab steht als ?tab=… in der Adresse, damit man direkt dorthin verlinken kann
 * (die Route /profile bleibt dieselbe).
 */
export function ProfileTabs({
  initialTab,
  panels,
}: {
  initialTab: ProfileTabKey;
  panels: Record<ProfileTabKey, ReactNode>;
}) {
  const [active, setActive] = useState<ProfileTabKey>(initialTab);

  function select(key: string) {
    if (!isProfileTab(key) || key === active) return;
    setActive(key);
    const url = new URL(window.location.href);
    if (key === "ueberblick") url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <>
      <TabBar
        ariaLabel="Mein Profil"
        layoutId="profile-tabs"
        items={PROFILE_TABS.map((t) => ({ key: t.key, label: t.label }))}
        activeKey={active}
        onSelect={select}
      />
      <div>
        {PROFILE_TABS.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
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
