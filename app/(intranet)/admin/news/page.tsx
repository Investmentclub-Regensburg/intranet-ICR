import { getCachedAuth } from "@/utils/supabase/cached-auth";
import { getNews } from "@/app/(intranet)/news/actions";
import { NewsHub } from "@/components/admin/NewsHub";

type Props = {
  searchParams: Promise<{ ansicht?: string }>;
};

export default async function AdminNewsPage({ searchParams }: Props) {
  const { ansicht } = await searchParams;
  const view = ansicht === "verwalten" ? "manage" : "choose";
  const [{ profile }, news] = await Promise.all([getCachedAuth(), getNews()]);

  const authorName = [profile?.["Vorname"], profile?.["Nachname"]]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return (
    <NewsHub
      view={view}
      authorName={authorName || "Vorstand"}
      news={news.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        created_at: n.created_at,
        author: `${n.author_vorname} ${n.author_nachname}`.trim(),
      }))}
    />
  );
}
