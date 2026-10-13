import { cn } from "@/lib/utils";
import { ICR_LOGO } from "./logo-data";

type IcrLogoProps = {
  className?: string;
  /** Barrierefreier Name; leer = dekorativ (z. B. neben ausgeschriebenem Namen). */
  title?: string;
};

/**
 * Bildmarke des ICR (Stier + Kurslinie) als Inline-SVG in `currentColor`,
 * also über Textfarbe einfärbbar (`text-brand`, `text-white`).
 */
export function IcrLogo({ className, title }: IcrLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={ICR_LOGO.viewBox}
      fill="currentColor"
      className={cn("h-10 w-auto", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={ICR_LOGO.bull} />
      <path d={ICR_LOGO.zigzagFill} />
    </svg>
  );
}

/** Bildmarke + Vereinsname zweizeilig (wie im mobilen Menü der Website). */
export function IcrWordmark({
  className,
  subline = "Intranet",
  logoClassName,
}: {
  className?: string;
  subline?: string;
  logoClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <IcrLogo className={cn("h-9 w-auto shrink-0 text-brand", logoClassName)} />
      <span className="min-w-0 leading-[1.15]">
        <span className="block text-[0.8125rem] font-semibold tracking-[-0.01em]">
          Investment Club Regensburg
        </span>
        {subline && (
          <span className="block text-xs font-medium text-muted-foreground">{subline}</span>
        )}
      </span>
    </span>
  );
}
