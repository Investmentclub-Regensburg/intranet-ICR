"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TabBar } from "@/components/kit/TabBar";
import { PROFILE_TABS, isProfileTab, type ProfileTabKey } from "@/components/profile/tabs";

/**
 * Tabs für „Mein Profil“. Alle Bereiche werden auf dem Server gerendert und bleiben
 * im DOM (offene Formulare behalten ihren Stand), sichtbar ist nur der aktive. Der Tab
 * steht als ?tab=… in der Adresse, damit man direkt dorthin verlinken kann (die Route
 * /profile bleibt dieselbe).
 */
export function ProfileTabs({
  initialTab,
  panels,
}: {
  initialTab: ProfileTabKey;
  panels: Record<ProfileTabKey, ReactNode>;
}) {
  const [active, setActive] = useState<ProfileTabKey>(initialTab);
  const barRef = useRef<HTMLDivElement>(null);

  // Mobil ist die Leiste scrollbar: aktiven Tab ins Bild holen.
  useEffect(() => {
    const el = barRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

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
      <div ref={barRef}>
        <TabBar
          ariaLabel="Mein Profil"
          layoutId="profile-tabs"
          items={PROFILE_TABS.map((t) => ({ key: t.key, label: t.label }))}
          activeKey={active}
          onSelect={select}
        />
      </div>
      <div>
        {PROFILE_TABS.map((t) => (
          <div
            key={t.key}
            role="tabpanel"
            aria-label={t.label}
            hidden={t.key !== active}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
          >
            {panels[t.key]}
          </div>
        ))}
      </div>
    </>
  );
}
