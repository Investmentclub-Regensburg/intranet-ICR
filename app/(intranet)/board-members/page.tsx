import { AreaHeader, VEREIN_TABS } from "@/components/area/AreaHeader";
import { staggerProps } from "@/components/kit/Reveal";
import { PersonCard } from "@/components/board/PersonCard";
import { VORSTAND, VORSTAND_AMTSZEIT } from "@/components/board/vorstand";

export default function BoardMembersPage() {
  return (
    <div className="space-y-8">
      <AreaHeader title="Verein" tabs={VEREIN_TABS} layoutId="tabs-verein" ariaLabel="Bereiche des Vereins" />

      <section aria-labelledby="vorstand-titel" className="space-y-8">
        <div className="space-y-3">
          <p className="eyebrow">Amtszeit {VORSTAND_AMTSZEIT}</p>
          <h2 id="vorstand-titel" className="text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
            Vorstand
          </h2>
        </div>
        <ul
          {...staggerProps()}
          className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 xl:grid-cols-5"
        >
          {VORSTAND.map((m) => (
            <li key={m.name} className="min-w-0">
              <PersonCard {...m} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
