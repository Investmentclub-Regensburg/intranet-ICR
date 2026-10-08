import Image from "next/image";
import { Linkedin } from "lucide-react";
import { AreaHeader, VEREIN_TABS } from "@/components/area/AreaHeader";
import { cn } from "@/lib/utils";

type BoardMember = {
  name: string;
  role: string;
  focus: string;
  image: string;
  linkedin: string;
  imageClassName?: string;
};

// Daten wie bisher im Code (Reihenfolge: Vorsitz und Finanzen zuerst).
const BOARD: BoardMember[] = [
  {
    name: "Sarah Adloff",
    role: "Chief Executive Officer",
    focus: "1. Vorstandsvorsitzende",
    image: "/board/sarah-adloff.png",
    linkedin: "https://www.linkedin.com/in/sarah-isabelle-adloff-80b6492a0/",
  },
  {
    name: "Maximilian Thiel",
    role: "Chief Financial Officer",
    focus: "Finance, Legal & HR",
    image: "/board/maximilian-thiel.png",
    linkedin: "https://www.linkedin.com/in/maximilian-thiel-499865246/",
  },
  {
    name: "Justin Bolfrey",
    role: "Head of Information Technology",
    focus: "Website & IT Administration",
    image: "/board/justin-bolfrey.png",
    linkedin: "https://www.linkedin.com/in/justin-bolfrey-93a45a296/",
    imageClassName: "object-[center_20%]",
  },
  {
    name: "Kilian Kainz",
    role: "Chief Marketing Officer",
    focus: "Marketing & Social Media",
    image: "/board/kilian-kainz.png",
    linkedin: "https://www.linkedin.com/in/kilian-kainz-487579298/",
  },
  {
    name: "Simon Kirchner",
    role: "Chief Investment Officer",
    focus: "Analyst Program & Education",
    image: "/board/simon-kirchner.png",
    linkedin: "https://www.linkedin.com/in/simon-kirchner-abb709260/",
  },
];

/** Porträt-Kachel wie die PersonCard der Website: Bild rund 16 px, LinkedIn als Icon auf dem Bild. */
function BoardMemberTile({ member }: { member: BoardMember }) {
  return (
    <article className="min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted">
        <Image
          src={member.image}
          alt={`Porträt von ${member.name}`}
          fill
          sizes="(min-width: 1280px) 220px, (min-width: 768px) 30vw, 45vw"
          className={cn("object-cover", member.imageClassName)}
        />
        <a
          href={member.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${member.name} auf LinkedIn`}
          title="LinkedIn"
          className="absolute right-2.5 bottom-2.5 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground shadow-soft backdrop-blur transition-colors outline-none hover:bg-primary hover:text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <Linkedin className="size-4" aria-hidden />
        </a>
      </div>
      <h2 className="mt-3 text-[0.9375rem] leading-snug font-bold tracking-[-0.02em] text-foreground">
        {member.name}
      </h2>
      <p className="mt-0.5 text-xs font-semibold text-primary">{member.role}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{member.focus}</p>
    </article>
  );
}

export default function BoardMembersPage() {
  return (
    <div className="space-y-8">
      <AreaHeader
        title="Verein"
        tabs={VEREIN_TABS}
        activeKey="board"
        layoutId="tabs-verein"
        ariaLabel="Bereiche des Vereins"
      />

      <section aria-label="Vorstand" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-5">
        {BOARD.map((member) => (
          <BoardMemberTile key={member.name} member={member} />
        ))}
      </section>
    </div>
  );
}
