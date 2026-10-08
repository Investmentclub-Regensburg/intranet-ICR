/** Tabs von „Mein Profil“ (Server und Client). Der Schlüssel steht als ?tab=… in der Adresse. */
export const PROFILE_TABS = [
  { key: "ueberblick", label: "Überblick" },
  { key: "daten", label: "Meine Daten" },
  { key: "veranstaltungen", label: "Veranstaltungen" },
  { key: "mitgliedschaft", label: "Mitgliedschaft" },
] as const;

export type ProfileTabKey = (typeof PROFILE_TABS)[number]["key"];

export function isProfileTab(value: unknown): value is ProfileTabKey {
  return PROFILE_TABS.some((t) => t.key === value);
}
