import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  format,
  isSameMonth,
  isToday,
  setMonth,
  setYear,
} from "date-fns";
import { de } from "date-fns/locale";
import Link from "next/link";
import { getEvents } from "@/app/(intranet)/events/actions";
import { eventPath, shortTime } from "@/lib/events";
import { CalendarNav } from "@/components/calendar/CalendarNav";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function getMondayBasedWeekday(date: Date): number {
  return (getDay(date) + 6) % 7;
}

function parseMonthYear(searchParams: Record<string, string | string[] | undefined>) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  const y = searchParams?.year;
  const m = searchParams?.month;
  if (typeof y === "string") {
    const yNum = parseInt(y, 10);
    if (!Number.isNaN(yNum) && yNum >= 1970 && yNum <= 2100) year = yNum;
  }
  if (typeof m === "string") {
    const mNum = parseInt(m, 10);
    if (!Number.isNaN(mNum) && mNum >= 1 && mNum <= 12) month = mNum;
  }

  return { year, month };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonthYear(params);

  const events = await getEvents();
  const viewDate = setMonth(setYear(new Date(), year), month - 1);
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startOffset = getMondayBasedWeekday(monthStart);
  const totalCells = startOffset + days.length;
  const trailingEmpty = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);

  const eventsByDate = new Map<string, typeof events>();
  events.forEach((ev) => {
    const key = ev.event_date;
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(ev);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kalender</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(viewDate, "MMMM yyyy", { locale: de })}
          </p>
        </div>
        <CalendarNav year={year} month={month} />
      </div>

      <div className="flex justify-center rounded-lg border bg-muted/30 py-3">
        <p className="text-lg font-semibold text-foreground" aria-live="polite">
          {format(viewDate, "MMMM yyyy", { locale: de })}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-sm font-medium">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-3 text-center text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div
          className="grid grid-cols-7 auto-rows-fr"
          style={{ gridAutoRows: "minmax(88px, auto)" }}
        >
          {Array.from({ length: startOffset }, (_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[88px] border-b border-r border-border/60 bg-muted/10"
            />
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(key) ?? [];
            const today = isToday(day);
            return (
              <div
                key={key}
                className={`flex min-h-[88px] flex-col border-b border-r border-border/60 p-2 last:border-r-0 ${
                  today ? "bg-primary/5" : ""
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                    today
                      ? "bg-primary text-primary-foreground"
                      : isSameMonth(day, viewDate)
                        ? "text-foreground"
                        : "text-muted-foreground/70"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <div className="mt-1 flex flex-1 flex-col gap-1 overflow-hidden">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <Link
                      key={ev.id}
                      href={eventPath(ev.id)}
                      title={ev.title}
                      className="truncate rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
                    >
                      {ev.event_time && (
                        <span className="mr-1 opacity-90">{shortTime(ev.event_time)}</span>
                      )}
                      <span className="font-medium">{ev.title}</span>
                    </Link>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{dayEvents.length - 3} weitere
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {Array.from({ length: trailingEmpty }, (_, i) => (
            <div
              key={`trailing-${i}`}
              className="min-h-[88px] border-b border-r border-border/60 bg-muted/10 last:border-r-0"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
