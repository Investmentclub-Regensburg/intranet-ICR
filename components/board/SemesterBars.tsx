import type { BarItem } from "./BarList";

// Säulen je Semester (eine Reihe, eine Farbe): Wert über jeder Säule, Semester darunter,
// das laufende Semester heller und als „laufend“ markiert (noch nicht abgeschlossen).
// Reines HTML: Screenreader bekommen eine Liste „Semester: Wert“.

export function SemesterBars({
  items,
  unit,
  labelledBy,
}: {
  items: BarItem[];
  unit: string;
  /** ID der Überschrift, die die Liste benennt. */
  labelledBy?: string;
}) {
  const top = Math.max(1, ...items.map((i) => i.value));

  return (
    <div>
      <ol aria-labelledby={labelledBy} className="grid h-52 grid-flow-col auto-cols-fr items-end gap-2 border-b border-border sm:gap-4">
        {items.map((item, i) => {
          const current = i === items.length - 1;
          return (
            <li
              key={item.name}
              className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5"
              title={`${item.name}${current ? " (laufend)" : ""}: ${item.value} ${unit}`}
            >
              <span
                aria-hidden
                className={
                  item.value > 0
                    ? "text-xs font-semibold text-foreground tabular-nums"
                    : "text-xs text-muted-foreground tabular-nums"
                }
              >
                {item.value}
              </span>
              <span
                aria-hidden
                className={
                  current
                    ? "w-full max-w-12 rounded-t-[4px] bg-primary/45"
                    : "w-full max-w-12 rounded-t-[4px] bg-primary"
                }
                style={{
                  height: `${item.value > 0 ? Math.max(2, (item.value / top) * 82) : 0}%`,
                }}
              />
              <span className="sr-only">
                {item.name}
                {current ? " (laufend)" : ""}: {item.value} {unit}
              </span>
            </li>
          );
        })}
      </ol>
      <div
        aria-hidden
        className="grid grid-flow-col auto-cols-fr gap-2 pt-2 sm:gap-4"
      >
        {items.map((item, i) => (
          <span
            key={item.name}
            className="truncate text-center text-[0.6875rem] text-muted-foreground sm:text-xs"
          >
            {/* Mobil zweizeilig (SoSe / 26), damit nichts abgeschnitten wird. */}
            {item.name.split(" ").map((part, j) => (
              <span key={j} className="block sm:inline">
                {j > 0 && <span className="hidden sm:inline"> </span>}
                {part}
              </span>
            ))}
            {i === items.length - 1 && (
              <span className="hidden sm:block">laufend</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
