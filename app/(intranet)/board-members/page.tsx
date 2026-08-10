import Image from "next/image";
import Link from "next/link";

type BoardMember = {
  name: string;
  role: string;
  focus: string;
  image: string;
  linkedin: string;
  imageClassName?: string;
};

const TOP_ROW: BoardMember[] = [
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
];

const BOTTOM_ROW: BoardMember[] = [
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

function BoardMemberCard({ member }: { member: BoardMember }) {
  return (
    <article className="group flex flex-col items-center text-center">
      <div className="relative h-40 w-40 overflow-hidden rounded-full border border-border bg-muted shadow-sm transition-all duration-300 group-hover:border-primary/60 group-hover:shadow-lg sm:h-44 sm:w-44 md:h-48 md:w-48">
        <Image
          src={member.image}
          alt={member.name}
          fill
          sizes="192px"
          className={`object-cover transition-transform duration-300 group-hover:scale-105 ${member.imageClassName ?? ""}`}
        />
      </div>

      <div className="mt-3 space-y-0.5">
        <h2 className="text-lg font-semibold">{member.name}</h2>
        <p className="text-sm font-medium text-muted-foreground">
          {member.role}
        </p>
        <p className="text-xs text-muted-foreground">{member.focus}</p>
      </div>

      <div className="mt-3">
        <Link
          href={member.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`LinkedIn-Profil von ${member.name} öffnen`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-muted-foreground/40 bg-background text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
        >
          in
        </Link>
      </div>
    </article>
  );
}

export default function BoardMembersPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Vorstand
        </h1>
        <p className="text-base text-muted-foreground md:text-lg">
          Das aktuelle Vorstandsteam des Investmentclub Regensburg e.V.
        </p>
      </header>

      <section className="flex flex-col items-center gap-6 md:gap-8">
        <div className="grid w-full max-w-3xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 sm:gap-10">
          {TOP_ROW.map((member) => (
            <BoardMemberCard key={member.name} member={member} />
          ))}
        </div>

        <div className="grid w-full max-w-5xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-3 sm:gap-8">
          {BOTTOM_ROW.map((member) => (
            <BoardMemberCard key={member.name} member={member} />
          ))}
        </div>
      </section>
    </div>
  );
}
