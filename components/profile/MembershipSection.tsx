import { BadgeCheck } from "lucide-react";
import { Stagger } from "@/components/kit/Reveal";
import { StatusPill, type StatusVariant } from "@/components/kit/StatusCard";
import { AlumniStatusCard, type AlumniInfo } from "@/components/profile/AlumniStatusCard";
import { CancelMembership } from "@/components/profile/CancelMembership";
import { TileIcon } from "@/components/profile/ProfileCard";
import type { FeeStop } from "@/components/profile/profile-format";
import { MEMBERSHIP_FEE_PER_SEMESTER } from "@/lib/membership-fee";
import { cn } from "@/lib/utils";

export type MembershipData = {
  roleLabel: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  isCancelled: boolean;
  /** „12.03.2024“ oder null */
  memberSince: string | null;
  /** „2 Jahre, 7 Monate“ oder null */
  duration: string | null;
  /** null = beitragsfrei (Alumni) */
  feeStop: FeeStop | null;
};

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });

/**
 * Meine Mitgliedschaft (Skizze Profil.dc.html): oben die Mitgliedskarte mit Beitrag und Eckdaten, darunter
 * Alumni-Status und „Mitgliedschaft kündigen“ als zwei gleich große Kacheln (ab lg nebeneinander). Fehlt die
 * Kündigung (bereits gekündigt), nimmt der Alumni-Status die volle Breite. Die Zahlungsweise steht jetzt in
 * der Bankverbindung unter Meine Daten.
 */
export function MembershipSection({ data, rolle, alumni }: { data: MembershipData; rolle: string; alumni: AlumniInfo }) {
  const paysFee = data.feeStop !== null;
  const facts: { label: string; value: string | null; hint?: string }[] = [
    { label: "Mitglied seit", value: data.memberSince },
    { label: "Mitgliedsdauer", value: data.duration },
  ];
  if (data.feeStop) {
    facts.push({ label: "Nächstes Beitragssemester", value: data.feeStop.semester, hint: `ab ${data.feeStop.stichtag}` });
  }

  return (
    <Stagger delay={0.05} className="grid gap-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <TileIcon Icon={BadgeCheck} large />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
                ICR-Mitgliedschaft
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-2xl leading-tight font-bold tracking-[-0.03em]">{data.roleLabel}</h2>
                <StatusPill status={data.statusVariant}>{data.statusLabel}</StatusPill>
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            {paysFee ? (
              <p className="leading-none">
                <span className="text-3xl font-bold tracking-[-0.03em] tabular-nums">
                  {EURO.format(MEMBERSHIP_FEE_PER_SEMESTER)}
                </span>
                <span className="ml-1 text-sm text-muted-foreground">/ Semester</span>
              </p>
            ) : (
              <p className="text-lg font-bold tracking-[-0.02em]">Beitragsfrei</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {paysFee ? "Einzug per SEPA-Lastschrift" : "Alumni zahlen keinen Beitrag"}
            </p>
          </div>
        </div>
        <dl
          className={cn(
            "grid grid-cols-2 gap-px border-t border-border bg-border",
            facts.length === 3 && "sm:grid-cols-3",
          )}
        >
          {facts.map(({ label, value, hint }, i) => (
            <div
              key={label}
              className={cn("bg-card px-5 py-4 sm:px-6", facts.length === 3 && i === 2 && "col-span-2 sm:col-span-1")}
            >
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-[0.9375rem] font-semibold tabular-nums">
                {value ?? <span className="font-normal text-muted-foreground">–</span>}
                {hint && <span className="block text-xs font-normal text-muted-foreground lg:ml-1.5 lg:inline">{hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className={cn("grid items-stretch gap-4", !data.isCancelled && "lg:grid-cols-2")}>
        <AlumniStatusCard rolle={rolle} info={alumni} />
        {!data.isCancelled && <CancelMembership feeStop={data.feeStop} />}
      </div>
    </Stagger>
  );
}
