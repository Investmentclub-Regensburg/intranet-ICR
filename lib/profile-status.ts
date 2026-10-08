export function getProfileStatus(
  profile: Record<string, unknown> | null | undefined
): string {
  if (!profile) return "";

  const candidates = [profile.status, profile.Status]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);

  // Sicherheitspriorität: sobald eines der Status-Felder "cancelled" ist, gilt der Account als gekündigt.
  if (candidates.includes("cancelled")) return "cancelled";

  return candidates[0] ?? "";
}

export function isCancelledProfile(
  profile: Record<string, unknown> | null | undefined
): boolean {
  return getProfileStatus(profile) === "cancelled";
}

/** Mitgliedsantrag noch nicht freigegeben (Status „applicant“). */
export function isPendingProfile(
  profile: Record<string, unknown> | null | undefined
): boolean {
  return getProfileStatus(profile) === "applicant";
}

/** Aktives Mitglied (inkl. Alumni): Profil vorhanden, weder gekündigt noch Antrag offen. */
export function isActiveMemberProfile(
  profile: Record<string, unknown> | null | undefined
): boolean {
  return Boolean(profile) && !isCancelledProfile(profile) && !isPendingProfile(profile);
}
