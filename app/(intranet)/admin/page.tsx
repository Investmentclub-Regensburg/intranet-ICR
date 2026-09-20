import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Banknote,
  Megaphone,
  CalendarDays,
  ArrowRight,
  KeyRound,
  GraduationCap,
} from "lucide-react";

const ADMIN_CARDS = [
  {
    href: "/admin/members",
    title: "Mitglieder",
    description: "Mitglieder verwalten, Rollen zuweisen und Übersichten einsehen.",
    icon: Users,
  },
  {
    href: "/admin/finance",
    title: "Finanzen & SEPA",
    description: "SEPA-Export, Beitragsübersichten und CSV/XML-Export für Lastschriften.",
    icon: Banknote,
  },
  {
    href: "/admin/news",
    title: "News",
    description: "Neue Nachrichten für das Schwarze Brett veröffentlichen.",
    icon: Megaphone,
  },
  {
    href: "/admin/events",
    title: "Events",
    description: "Veranstaltungen anlegen, mit Bild und Anmeldung.",
    icon: CalendarDays,
  },
  {
    href: "/admin/bvh-login",
    title: "BVH Login",
    description: "Anfragen für BVH-Zugangsdaten einsehen und abhaken.",
    icon: KeyRound,
  },
  {
    href: "/admin/alumni-requests",
    title: "Alumni-Anträge",
    description: "Anträge auf Alumni-Status prüfen, freischalten oder ablehnen.",
    icon: GraduationCap,
  },
];

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin-Bereich</h1>
        <p className="mt-1 text-muted-foreground">
          Wähle einen Bereich, um fortzufahren.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_CARDS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group block">
              <Card className="h-full border-2 transition-all duration-300 ease-out hover:scale-[1.02] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary transition-colors duration-300 group-hover:bg-primary/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
                </CardHeader>
                <CardContent className="pt-0">
                  <CardTitle className="text-lg transition-colors duration-300 group-hover:text-primary">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
