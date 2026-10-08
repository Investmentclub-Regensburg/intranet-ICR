import { Stagger } from "@/components/kit/Reveal";
import type { StatusVariant } from "@/components/kit/StatusCard";
import { AlumniStatusCard, type AlumniInfo } from "@/components/profile/AlumniStatusCard";
import { CancelMembership } from "@/components/profile/CancelMembership";
import type { FeeStop } from "@/components/profile/profile-format";

/** Mitgliedschaft: Alumni-Status, darunter dezent die Mitgliedschaft mit „Kündigen“. Die Satzung liegt im Bereich „Verein“. */
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
    <Stagger delay={0.05} className="grid gap-4">
      <AlumniStatusCard rolle={rolle} info={alumni} />
      {!isCancelled && (
        <CancelMembership statusLabel={statusLabel} status={statusVariant} since={since} feeStop={feeStop} />
      )}
    </Stagger>
  );
}
