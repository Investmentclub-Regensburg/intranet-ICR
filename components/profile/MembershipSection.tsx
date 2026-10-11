import Link from "next/link";
import { ArrowRight, BadgeCheck, CreditCard, type LucideIcon } from "lucide-react";
import { Stagger } from "@/components/kit/Reveal";
import { StatusPill, type StatusVariant } from "@/components/kit/StatusCard";
import { AlumniStatusCard, type AlumniInfo } from "@/components/profile/AlumniStatusCard";
import { CancelMembership } from "@/components/profile/CancelMembership";
import type { FeeStop } from "@/components/profile/profile-format";
import { MEMBERSHIP_FEE_PER_SEMESTER } from "@/lib/membership-fee";
import { cn } from "@/lib/utils";

export type MembershipData = {
  roleLabel: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  isCancelled: boolean;
  /** Mitgliedsnummer oder leer */
  memberNumber: string;
  /** „12.03.2024“ oder null */
  memberSince: string | null;
  /** „2 Jahre, 7 Monate“ oder null */
  duration: string | null;
  /** null = beitragsfrei (Alumni) */
  feeStop: FeeStop | null;
  /** „•••• •••• •••• 1234“ oder leer */
  ibanMasked: string;
  /** „12.03.2024“ oder null */
  mandateDate: string | null;
};

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });

/**
 * Mitgliedschaft im Stil einer SaaS-Abo-Seite: oben die Mitgliedschaft mit Beitrag und Eckdaten,
 * darunter Zahlungsweise und Alumni-Status nebeneinander (Alumni: nur Alumni-Status), ganz unten
 * abgesetzt die Kündigung.
 */
export function MembershipSection({ data, rolle, alumni }: { data: MembershipData; rolle: string; alumni: AlumniInfo }) {
  const paysFee = data.feeStop !== null;
  const facts: { label: string; value: string | null; hint?: string }[] = [
    { label: "Mitgliedsnummer", value: data.memberNumber || null },
    { label: "Mitglied seit", value: data.memberSince },
    { label: "Mitgliedsdauer", value: data.duration },
  ];
  if (data.feeStop) {
    facts.push({ label: "Nächstes Beitragssemester", value: data.feeStop.semester, hint: `ab ${data.feeStop.stichtag}` });
  }

  return (
    <Stagger delay={0.05} className="grid gap-8">
      <div className="grid gap-4">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <span className="tile-icon size-12 rounded-xl">
                <BadgeCheck className="size-6" aria-hidden />
              </span>
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
              facts.length === 4 ? "lg:grid-cols-4" : "sm:grid-cols-3",
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

        <div className={cn("grid items-stretch gap-4", paysFee && "lg:grid-cols-2")}>
          {paysFee && (
            <SettingsCard
              Icon={CreditCard}
              title="Zahlungsweise"
              description={
                data.ibanMasked
                  ? `SEPA-Lastschrift${data.mandateDate ? ` · Mandat vom ${data.mandateDate}` : ""}`
                  : "Noch keine Bankverbindung hinterlegt."
              }
              detail={data.ibanMasked || undefined}
              action={
                <Link
                  href="/profile?tab=daten"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {data.ibanMasked ? "Ändern" : "Hinterlegen"}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
          )}
          <AlumniStatusCard rolle={rolle} info={alumni} />
        </div>
      </div>

      {!data.isCancelled && <CancelMembership feeStop={data.feeStop} />}
    </Stagger>
  );
}

function SettingsCard({
  Icon,
  title,
  description,
  detail,
  action,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="tile-icon size-11 rounded-xl">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base leading-snug font-bold tracking-[-0.02em]">{title}</h2>
          {detail && <p className="font-mono text-sm tracking-wide tabular-nums">{detail}</p>}
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}
