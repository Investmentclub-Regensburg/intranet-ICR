import { Stagger } from "@/components/kit/Reveal";
import type { StatusVariant } from "@/components/kit/StatusCard";
import { AlumniStatusCard, type AlumniInfo } from "@/components/profile/AlumniStatusCard";
import { CancelMembership } from "@/components/profile/CancelMembership";
import { StatuteTile } from "@/components/profile/StatuteTile";
import type { FeeStop } from "@/components/profile/profile-format";

/** Mitgliedschaft: Alumni-Status und Satzung, darunter dezent die Mitgliedschaft mit „Kündigen“. */
export function MembershipSection({
  rolle,
  isCancelled,
  statusLabel,
  statusVariant,
  since,
  alumni,
  feeStop,
}: {
  rolle: string;
  isCancelled: boolean;
  statusLabel: string;
  statusVariant: StatusVariant;
  since: string | null;
  alumni: AlumniInfo;
  feeStop: FeeStop | null;
}) {
  return (
    <Stagger delay={0.05} className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <AlumniStatusCard rolle={rolle} info={alumni} />
      <StatuteTile />
      {!isCancelled && (
        <div className="lg:col-span-2">
          <CancelMembership statusLabel={statusLabel} status={statusVariant} since={since} feeStop={feeStop} />
        </div>
      )}
    </Stagger>
  );
}
