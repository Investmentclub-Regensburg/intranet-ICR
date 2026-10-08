import { AlumniStatusCard, type AlumniInfo } from "@/components/profile/AlumniStatusCard";
import { CancelMembership } from "@/components/profile/CancelMembership";
import { StatuteTile } from "@/components/profile/StatuteTile";
import type { FeeStop } from "@/components/profile/profile-format";

/** Mitgliedschaft: Alumni-Status, Satzung, darunter dezent „Mitgliedschaft beenden“. */
export function MembershipSection({
  rolle,
  isCancelled,
  statusLabel,
  since,
  alumni,
  feeStop,
}: {
  rolle: string;
  isCancelled: boolean;
  statusLabel: string;
  since: string | null;
  alumni: AlumniInfo;
  feeStop: FeeStop | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <AlumniStatusCard rolle={rolle} info={alumni} />
        <StatuteTile />
      </div>
      {!isCancelled && <CancelMembership statusLabel={statusLabel} since={since} feeStop={feeStop} />}
    </div>
  );
}
