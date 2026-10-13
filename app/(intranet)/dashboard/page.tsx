import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/utils/supabase/guards";
import { PageHeader } from "@/components/kit/PageHeader";
import { SectionHeading, TileSkeletons } from "@/components/dashboard/parts";
import {
  AdminSection,
  MyRegistrationsSection,
  NewsSection,
  NextEventsSection,
  QuickAccessSection,
} from "./sections";
import { todayLabel } from "./data";

// Übersicht: Begrüßung, nächste Events, News, eigene Anmeldungen, Schnellzugriff und
// für Vorstand/Admin eine Zeile mit offenen Vorgängen. Die Kachel-Raster reagieren auf die
// Inhaltsbreite (Container-Queries), weil ab md die Sidebar Platz nimmt.

export default async function DashboardPage() {
  const auth = await requireUser();
  if (!auth.ok) redirect("/login");

  const firstName = String(auth.profile?.["Vorname"] ?? "").trim();
  const isStaff = auth.role === "admin" || auth.role === "board";

  return (
    <div className="@container space-y-10 pb-4 md:space-y-12">
      <PageHeader eyebrow={todayLabel()} title={firstName ? `Hallo ${firstName}` : "Hallo"} />

      <section aria-labelledby="dash-events">
        <SectionHeading id="dash-events" title="Nächste Events" href="/events" linkLabel="Alle Events" />
        <Suspense
          fallback={<TileSkeletons count={3} className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3" tileClassName="h-[11.5rem]" />}
        >
          <NextEventsSection />
        </Suspense>
      </section>

      <div className="grid grid-cols-1 gap-10 @4xl:grid-cols-3 @4xl:gap-6">
        <section aria-labelledby="dash-news" className="@4xl:col-span-2">
          <SectionHeading id="dash-news" title="Neues aus dem Verein" href="/news" linkLabel="Alle News" />
          <Suspense fallback={<TileSkeletons count={3} variant="row" className="grid grid-cols-1 gap-3" tileClassName="h-[6.5rem]" />}>
            <NewsSection />
          </Suspense>
        </section>

        <section aria-labelledby="dash-mine">
          <SectionHeading id="dash-mine" title="Meine Anmeldungen" />
          <Suspense fallback={<TileSkeletons count={2} variant="row" className="grid grid-cols-1 gap-3" />}>
            <MyRegistrationsSection />
          </Suspense>
        </section>
      </div>

      <section aria-labelledby="dash-quick">
        <SectionHeading id="dash-quick" title="Schnellzugriff" />
        <Suspense
          fallback={<TileSkeletons count={4} variant="stat" className="grid grid-cols-2 gap-3 @2xl:grid-cols-4 @2xl:gap-4" tileClassName="p-4" />}
        >
          <QuickAccessSection />
        </Suspense>
      </section>

      {isStaff && (
        <section aria-labelledby="dash-admin">
          <SectionHeading id="dash-admin" title="Verwaltung" href="/admin" linkLabel="Admin-Bereich" />
          <Suspense
            fallback={<TileSkeletons count={5} variant="stat" className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @xl:gap-4 @4xl:grid-cols-5" />}
          >
            <AdminSection />
          </Suspense>
        </section>
      )}
    </div>
  );
}
