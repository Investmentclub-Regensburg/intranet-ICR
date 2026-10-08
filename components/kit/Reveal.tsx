import type { CSSProperties, ElementType, ReactNode } from "react";

/*
 * Einfliegen wie auf der Website, als Bausteine für Seiteninhalte.
 *
 * - <Reveal>: ein Block steigt mit etwas Weg und leichter Unschärfe auf
 *   (`variant="rise"`, Standard) oder blendet nur ein (`"fade"`). `delay` in
 *   Sekunden (Standard 0,12 s, also kurz nach dem Seitenkopf).
 * - <Stagger>: die direkten Kinder (Kacheln, Listenzeilen) kommen gestaffelt
 *   (60 ms Abstand, ab dem 12. Kind gleichzeitig). `delay` = Start des ersten
 *   Kindes (Standard 0,18 s). TileGrid und ChoiceTiles staffeln schon selbst.
 * - <RevealHeading>: beliebiger Überschriften-Block; die direkten Kinder kommen
 *   nacheinander, eine `.eyebrow` gleitet von links herein (PageHeader nutzt
 *   dasselbe).
 *
 * Reine CSS-Animation (globals.css, Abschnitt „Einfliegen im Intranet“): ohne JS
 * sichtbar, läuft bei jeder Client-Navigation neu, „Bewegung reduzieren“ =
 * nur Einblenden. Kein "use client" nötig, funktioniert in Server- und
 * Client-Komponenten.
 */

type RevealBaseProps = {
  /** HTML-Element (Standard div), z. B. "section", "ul". */
  as?: ElementType;
  /** Verzögerung in Sekunden. */
  delay?: number;
  className?: string;
  children: ReactNode;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

function delayStyle(delay?: number): CSSProperties | undefined {
  return delay === undefined ? undefined : ({ "--reveal-delay": `${delay}s` } as CSSProperties);
}

export function Reveal({
  as: Tag = "div",
  variant = "rise",
  delay,
  className,
  children,
  ...rest
}: RevealBaseProps & { variant?: "rise" | "fade" }) {
  return (
    <Tag data-reveal={variant} style={delayStyle(delay)} className={className} {...rest}>
      {children}
    </Tag>
  );
}

export function Stagger({ as: Tag = "div", delay, className, children, ...rest }: RevealBaseProps) {
  return (
    <Tag data-reveal="stagger" style={delayStyle(delay)} className={className} {...rest}>
      {children}
    </Tag>
  );
}

export function RevealHeading({ as: Tag = "div", delay, className, children, ...rest }: RevealBaseProps) {
  return (
    <Tag data-reveal="heading" style={delayStyle(delay)} className={className} {...rest}>
      {children}
    </Tag>
  );
}

/** Für eigene Elemente: Attribute für gestaffelte Kinder, z. B. `<ul {...staggerProps(0.2)}>`. */
export function staggerProps(delay?: number) {
  return { "data-reveal": "stagger", style: delayStyle(delay) } as const;
}
