import type { CSSProperties } from "react";
import Image from "next/image";
import { Linkedin } from "lucide-react";
import type { VorstandMitglied } from "./vorstand";

/**
 * Porträtkarte wie auf der Website (src/components/ui/PersonCard.astro): Porträt im
 * Hochformat 4:5 mit runden Ecken, Ausschnitt über `fokus`/`zoom`, beim Hover
 * zoomt das Bild leicht um denselben Fixpunkt (Kopf bleibt stehen) und verliert den
 * leichten Grauschleier. LinkedIn als runder Knopf auf dem Bild, darunter Name,
 * Rolle in Markenrot und Bereich.
 */
export function PersonCard({ name, rolle, bereich, linkedin, foto, fokus, zoom = 1 }: VorstandMitglied) {
  const crop = { "--fokus": fokus, "--zoom": String(zoom) } as CSSProperties;

  return (
    <article className="group min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-line">
        <Image
          src={foto}
          alt={`Porträt von ${name}`}
          fill
          sizes="(min-width: 1280px) 200px, (min-width: 640px) 30vw, 45vw"
          style={crop}
          className={[
            "object-cover [object-position:var(--fokus)] [transform-origin:var(--fokus)]",
            "[transform:scale(var(--zoom))] [filter:grayscale(0.15)]",
            "[transition:transform_1.2s_var(--ease-out),filter_0.8s_ease]",
            "group-hover:[transform:scale(calc(var(--zoom)*1.04))] group-hover:[filter:none]",
            "motion-reduce:[transition:none]",
          ].join(" ")}
        />
        <a
          href={linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} auf LinkedIn`}
          className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-card/90 text-ink shadow-sm backdrop-blur transition-colors outline-none hover:bg-brand hover:text-white focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <Linkedin className="size-[17px]" aria-hidden />
        </a>
      </div>
      <h3 className="mt-4 text-lg font-bold tracking-[-0.02em] text-ink">{name}</h3>
      <p className="mt-0.5 text-sm font-medium text-brand">{rolle}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-mute">{bereich}</p>
    </article>
  );
}
