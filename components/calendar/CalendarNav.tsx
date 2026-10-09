import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconLink } from "@/components/kit/IconButton";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

function monthHref(year: number, month: number): string {
  return `/calendar?year=${year}&month=${month}`;
}

type Props = {
  year: number;
  month: number; // 1–12
  /** Aktueller Monat in Berlin, für „Heute“. */
  currentYear: number;
  currentMonth: number;
};

/**
 * Monatskopf: Monat und Jahr einmal, zentriert, Pfeile als Icon-Links, „Heute“ rechts.
 * Reine Links (?year&month wie bisher), funktioniert ohne JavaScript.
 */
export function CalendarNav({ year, month, currentYear, currentMonth }: Props) {
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const isCurrent = year === currentYear && month === currentMonth;

  return (
    <div className="flex items-center justify-between gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr]">
      <span aria-hidden className="hidden sm:block" />
      <div className="flex items-center gap-1 sm:gap-3">
        <IconLink href={monthHref(prev.y, prev.m)} label={`${monthName(prev.m)} ${prev.y}`} variant="outline">
          <ChevronLeft />
        </IconLink>
        <h2
          className="min-w-[8.5rem] text-center text-base font-bold tracking-[-0.02em] text-foreground sm:min-w-[12rem] sm:text-xl"
          aria-live="polite"
        >
          {monthName(month)} {year}
        </h2>
        <IconLink href={monthHref(next.y, next.m)} label={`${monthName(next.m)} ${next.y}`} variant="outline">
          <ChevronRight />
        </IconLink>
      </div>
      <div className="flex justify-end">
        <Link
          href={monthHref(currentYear, currentMonth)}
          aria-current={isCurrent ? "date" : undefined}
          className={cn(
            buttonVariants({ variant: isCurrent ? "ghost" : "outline" }),
            isCurrent && "pointer-events-none text-muted-foreground",
          )}
        >
          Heute
        </Link>
      </div>
    </div>
  );
}
