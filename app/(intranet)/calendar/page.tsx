import Link from "next/link";
import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getEvents, type EventListItem } from "@/app/(intranet)/events/actions";
import { eventPath, formatTimeRange, isEventPast, shortTime } from "@/lib/events";
import { cn } from "@/lib/utils";
import { AdminShortcut } from "@/components/area/AdminShortcut";
import { AreaHeader, EVENT_TABS } from "@/components/area/AreaHeader";
import { EmptyState } from "@/components/kit/PageHeader";
import { CalendarNav, monthName } from "@/components/calendar/CalendarNav";
import { eventDateParts, todayInBerlin } from "@/components/events/event-display";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MAX_CHIPS = 3;

function parseMonthYear(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: { year: number; month: number },
) {
  let { year, month } = fallback;
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

const pad = (n: number) => String(n).padStart(2, "0");

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // „Heute“ in Berlin, unabhängig von der Zeitzone des Servers.
  const todayKey = todayInBerlin();
  const [ty, tm] = todayKey.split("-").map(Number);
  const { year, month } = parseMonthYear(params, { year: ty, month: tm });

  const [{ profile }, events] = await Promise.all([getCachedAuth(), getEvents()]);
  const role = roleOf(profile as Record<string, unknown> | null);
  const canManage = role === "admin" || role === "board";

  // Monat als reine Datumsrechnung (UTC), damit keine Zeitzone Tage verschiebt.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Montag = 0
  const trailingEmpty = (7 - ((startOffset + daysInMonth) % 7)) % 7;
  const days = Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);

  const eventsByDate = new Map<string, EventListItem[]>();
  for (const ev of events) {
    const list = eventsByDate.get(ev.event_date) ?? [];
    list.push(ev);
    eventsByDate.set(ev.event_date, list);
  }
  const agendaDays = days.filter((d) => eventsByDate.has(d));

  return (
    <div className="space-y-10">
      <AreaHeader
        title="Veranstaltungen"
        intro="Hier findest du alle Termine zum Hingehen."
        tabs={EVENT_TABS}
        layoutId="tabs-veranstaltungen"
        ariaLabel="Ansicht der Veranstaltungen"
        action={
          canManage ? (
            <AdminShortcut href="/admin/events" label="Neue Veranstaltung" />
          ) : undefined
        }
      />

      <section aria-label={`${monthName(month)} ${year}`} className="space-y-5">
        <CalendarNav year={year} month={month} currentYear={ty} currentMonth={tm} />

        {/* Ab md: Monatsraster */}
        <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-2.5 text-center text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0 [&>*:nth-last-child(-n+7)]:border-b-0">
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`leer-${i}`} className="min-h-28 border-r border-b border-border bg-muted/40" />
            ))}
            {days.map((key) => {
              const dayEvents = eventsByDate.get(key) ?? [];
              const isToday = key === todayKey;
              const isPastDay = key < todayKey;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-28 flex-col gap-1.5 border-r border-b border-border p-2",
                    isToday && "bg-brand-tint/60",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full text-sm tabular-nums",
                      isToday
                        ? "bg-primary font-bold text-primary-foreground"
                        : isPastDay
                          ? "text-muted-foreground"
                          : "font-medium text-foreground",
                    )}
                    aria-label={isToday ? "Heute" : undefined}
                  >
                    {Number(key.slice(8))}
                  </span>
                  {dayEvents.slice(0, MAX_CHIPS).map((ev) => (
                    <Link
                      key={ev.id}
                      href={eventPath(ev.id)}
                      title={ev.title}
                      className={cn(
                        "block rounded-[5px] border-l-2 border-primary bg-brand-tint px-1.5 py-1 text-xs leading-snug text-foreground transition-colors outline-none",
                        "hover:bg-primary hover:text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        isEventPast(ev) && "border-primary/40 bg-muted text-muted-foreground",
                      )}
                    >
                      {ev.event_time && (
                        <span className="block text-[11px] tabular-nums opacity-75">{shortTime(ev.event_time)}</span>
                      )}
                      <span className="line-clamp-2 font-semibold break-words">{ev.title}</span>
                    </Link>
                  ))}
                  {dayEvents.length > MAX_CHIPS && (
                    <span className="px-1.5 text-xs text-muted-foreground">+{dayEvents.length - MAX_CHIPS} weitere</span>
                  )}
                </div>
              );
            })}
            {Array.from({ length: trailingEmpty }, (_, i) => (
              <div key={`rest-${i}`} className="min-h-28 border-r border-b border-border bg-muted/40" />
            ))}
          </div>
        </div>
        {agendaDays.length === 0 && (
          <p className="hidden text-center text-sm text-muted-foreground md:block">
            Keine Veranstaltungen im {monthName(month)}.
          </p>
        )}

        {/* Handy: Agenda-Liste der Tage mit Veranstaltungen */}
        <div className="md:hidden">
          {agendaDays.length === 0 ? (
            <EmptyState title={`Keine Veranstaltungen im ${monthName(month)}.`} />
          ) : (
            <ol className="space-y-3">
              {agendaDays.map((key) => {
                const p = eventDateParts(key);
                const isToday = key === todayKey;
                return (
                  <li key={key} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
                    <div
                      className={cn(
                        "flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl py-1.5 leading-none",
                        isToday ? "bg-primary text-primary-foreground" : "bg-brand-tint text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-semibold tracking-[0.12em] uppercase",
                          isToday ? "text-primary-foreground/85" : "text-primary",
                        )}
                      >
                        {p.weekday}
                      </span>
                      <span className="text-xl font-bold tracking-[-0.04em] tabular-nums">{p.day}</span>
                    </div>
                    <ul className="min-w-0 flex-1 divide-y divide-border">
                      {(eventsByDate.get(key) ?? []).map((ev) => {
                        const time = formatTimeRange(ev.event_time, ev.end_time);
                        return (
                          <li key={ev.id} className="py-1.5 first:pt-0 last:pb-0">
                            <Link
                              href={eventPath(ev.id)}
                              className="block rounded-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                            >
                              <span className="block truncate text-sm font-semibold text-foreground">{ev.title}</span>
                              {(time || ev.location) && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {[time, ev.location].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
