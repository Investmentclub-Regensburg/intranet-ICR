import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { roleOf } from "@/utils/supabase/guards";
import { getNews, markNewsAsRead } from "./actions";
import { EmptyState, PageHeader } from "@/components/kit/PageHeader";
import { AdminShortcut } from "@/components/area/AdminShortcut";
import { NewsList, type NewsListItem } from "@/components/news/NewsList";

function formatNewsDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

export default async function NewsPage() {
  const { user, profile } = await getCachedAuth();
  // Stand vor diesem Besuch (für „Neu“), bevor die Seite alles als gelesen markiert.
  const lastReadAt = (profile?.["letzter_news_aufruf"] as string | null | undefined) ?? null;
  if (user) {
    await markNewsAsRead();
  }
  const news = await getNews();

  const role = roleOf(profile as Record<string, unknown> | null);
  const canManage = role === "admin" || role === "board";

  const items: NewsListItem[] = news.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    author: `${n.author_vorname} ${n.author_nachname}`.trim(),
    createdAt: n.created_at,
    date: formatNewsDate(n.created_at),
  }));

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <PageHeader
          title="Schwarzes Brett"
          action={
            canManage ? (
              <AdminShortcut href="/admin/news" label="Neue Mitteilung" />
            ) : undefined
          }
        />
        <p className="fly-rise text-[0.9375rem] text-muted-foreground [--fly-delay:0.15s]">
          Mitteilungen vom Vorstand.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Mitteilungen."
          action={
            canManage ? (
              <AdminShortcut href="/admin/news" label="Neue Mitteilung" />
            ) : undefined
          }
        />
      ) : (
        <NewsList items={items} lastReadAt={lastReadAt} canDelete={canManage} />
      )}
    </div>
  );
}
