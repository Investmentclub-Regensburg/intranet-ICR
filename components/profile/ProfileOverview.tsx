import { BadgeCheck, CalendarDays, Hourglass, UserRound, type LucideIcon } from "lucide-react";

export type ProfileOverviewData = {
  vorname: string;
  nachname: string;
  email: string;
  initials: string;
  roleLabel: string;
  statusLabel: string;
  memberSince: string | null;
  duration: string | null;
};

/** Überblick: kurze Begrüßung und vier Status-Kacheln, keine Formularfelder. */
export function ProfileOverview({ data }: { data: ProfileOverviewData }) {
  const tiles: { Icon: LucideIcon; label: string; value: string | null }[] = [
    { Icon: UserRound, label: "Rolle", value: data.roleLabel },
    { Icon: BadgeCheck, label: "Status", value: data.statusLabel },
    { Icon: CalendarDays, label: "Mitglied seit", value: data.memberSince },
    { Icon: Hourglass, label: "Mitgliedsdauer", value: data.duration },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-tint text-lg font-bold tracking-[-0.02em] text-primary"
        >
          {data.initials}
        </span>
        <div className="min-w-0">
          <p className="text-xl leading-tight font-bold tracking-[-0.03em] sm:text-2xl">
            Hallo {data.vorname || "du"}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{data.email}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map(({ Icon, label, value }, i) => (
          <div
            key={label}
            style={{ animationDelay: `${80 + i * 60}ms` }}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both rounded-2xl border border-border bg-card p-4 duration-500 motion-reduce:animate-none sm:p-5"
          >
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="size-4 text-primary" aria-hidden />
              {label}
            </dt>
            <dd className="mt-2 text-lg leading-tight font-bold tracking-[-0.02em] text-foreground sm:text-xl">
              {value ?? <span className="font-normal text-muted-foreground">Nicht hinterlegt</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
