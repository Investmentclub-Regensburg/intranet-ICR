/**
 * Bereiche von „Mein Profil“ (Server, Client, Sidebar). Der Schlüssel steht als ?tab=… in der Adresse;
 * ohne (oder mit unbekanntem bzw. altem Schlüssel wie „ueberblick“) gilt „Meine Daten“.
 * `label` = Unterpunkt in der Seitenleiste, `title` = Überschrift der Seite.
 */
export const PROFILE_TABS = [
  { key: "daten", label: "Meine Daten", title: "Meine Daten" },
  { key: "mitgliedschaft", label: "Mitgliedschaft", title: "Meine Mitgliedschaft" },
  { key: "veranstaltungen", label: "Veranstaltungen", title: "Meine Veranstaltungen" },
] as const;

export type ProfileTabKey = (typeof PROFILE_TABS)[number]["key"];

export const DEFAULT_PROFILE_TAB: ProfileTabKey = "daten";

export function isProfileTab(value: unknown): value is ProfileTabKey {
  return PROFILE_TABS.some((t) => t.key === value);
}

/** Wert von ?tab=… → Bereich; fehlend, unbekannt oder alt („ueberblick“) → Meine Daten. */
export function profileTabFromParam(value: unknown): ProfileTabKey {
  return isProfileTab(value) ? value : DEFAULT_PROFILE_TAB;
}

/** Adresse eines Bereichs: Meine Daten ohne Parameter, die anderen mit ?tab=…. */
export function profileTabHref(key: ProfileTabKey): string {
  return key === DEFAULT_PROFILE_TAB ? "/profile" : `/profile?tab=${key}`;
}

export function profileTabTitle(key: ProfileTabKey): string {
  return PROFILE_TABS.find((t) => t.key === key)?.title ?? "Mein Profil";
}
