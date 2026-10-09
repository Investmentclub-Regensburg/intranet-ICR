import { AreaHeader } from "@/components/area/AreaHeader";
import { VEREIN_SECTIONS } from "@/components/layout/nav-sections";
import { staggerProps } from "@/components/kit/Reveal";
import { PersonCard } from "@/components/board/PersonCard";
import { VORSTAND, VORSTAND_AMTSZEIT } from "@/components/board/vorstand";

export default function BoardMembersPage() {
  return (
    <div className="space-y-8">
      <AreaHeader area="Verein" sections={VEREIN_SECTIONS} />

      <section aria-labelledby="vorstand-titel" className="space-y-8">
        {/* Titel „Vorstand“ steht im Seitenkopf; hier nur die Amtszeit. */}
        <p id="vorstand-titel" className="eyebrow">
          Amtszeit {VORSTAND_AMTSZEIT}
        </p>
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
