"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import { getCachedSupabase } from "@/utils/supabase/cached-auth";
import { requireRole, requireUser } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isSafeId } from "@/lib/validation";

export type NewsActionState = {
  success: boolean;
  error: string;
};

export type NewsItem = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_vorname: string;
  author_nachname: string;
};

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 10000;

export async function createNews(
  _prev: NewsActionState,
  formData: FormData
): Promise<NewsActionState> {
  const auth = await requireRole(["admin", "board"]);
  if (!auth.ok) return { success: false, error: auth.error };

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const content = (formData.get("content") as string | null)?.trim() ?? "";

  if (!title || !content) {
    return { success: false, error: "Betreff und Nachricht sind Pflichtfelder." };
  }
  if (title.length > MAX_TITLE_LENGTH || content.length > MAX_CONTENT_LENGTH) {
    return { success: false, error: "Betreff oder Nachricht ist zu lang." };
  }

  const supabase = await getCachedSupabase();
  const { error } = await supabase.from("news").insert({
    title,
    content,
    author_id: auth.user.id,
  });

  if (error) {
    console.error("createNews:", error);
    return { success: false, error: "News konnte nicht gespeichert werden." };
  }

  revalidatePath("/news");
  revalidatePath("/", "layout");
  return { success: true, error: "" };
}

async function fetchNewsFromDb(): Promise<NewsItem[]> {
  const admin = createServiceClient();

  const { data: newsRows, error } = await admin
    .from("news")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !newsRows) {
    return [];
  }

  const authorIds = [...new Set(newsRows.map((n) => n.author_id as string))];

  const { data: authors } = await admin
    .from("profiles")
    .select("user_id, Vorname, Nachname")
    .in("user_id", authorIds);

  const authorMap = new Map<string, { vorname: string; nachname: string }>();
  if (authors) {
    for (const a of authors) {
      authorMap.set(a.user_id as string, {
        vorname: ((a.Vorname as string) ?? "").trim(),
        nachname: ((a.Nachname as string) ?? "").trim(),
      });
    }
  }

  return newsRows.map((row) => {
    const author = authorMap.get(row.author_id as string);
    return {
      id: row.id as string,
      title: (row.title as string) ?? "",
      content: (row.content as string) ?? "",
      created_at: (row.created_at as string) ?? "",
      author_vorname: author?.vorname ?? "Unbekannt",
      author_nachname: author?.nachname ?? "",
    };
  });
}

const getNewsCached = unstable_cache(fetchNewsFromDb, ["news-list"], {
  revalidate: 60,
});

/** News-Liste – nur für eingeloggte Mitglieder. */
export async function getNews(): Promise<NewsItem[]> {
  const auth = await requireUser();
  if (!auth.ok) return [];
  return getNewsCached();
}

export async function markNewsAsRead(): Promise<void> {
  const auth = await requireUser();
  if (!auth.ok) return;
  const user = auth.user;

  const readAt = new Date().toISOString();

  // Wie bei anderen Profil-Updates: Service-Role nutzen, damit das Update nicht
  // still an RLS scheitert (Sidebar bekam sonst weiter den alten Zeitstempel).
  const admin = createServiceClient();

  let { data: profileRow, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow && !lookupError) {
    const fallback = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    profileRow = fallback.data;
    lookupError = fallback.error;
  }

  if (lookupError || !profileRow) return;

  const profileId = String((profileRow as { id?: unknown }).id ?? "").trim();
  if (!profileId) return;

  const { error: updateError } = await admin
    .from("profiles")
    .update({ letzter_news_aufruf: readAt })
    .eq("id", profileId);

  if (updateError) return;

  // Kein revalidatePath hier: markNewsAsRead wird u. a. aus der News-Seite (RSC) beim
  // Rendern aufgerufen – revalidatePath während des Renders ist in Next.js nicht erlaubt.
  // Aktualisierung der Sidebar: router.refresh() im Client (Sidebar) nach dem Aufruf.
}

export async function checkUnreadNews(lastReadAt: string | null): Promise<boolean> {
  const auth = await requireUser();
  if (!auth.ok) return false;

  // Nur gültige Zeitstempel als Filter übernehmen.
  let since: string | null = null;
  if (typeof lastReadAt === "string" && lastReadAt.length <= 64) {
    const parsed = Date.parse(lastReadAt);
    if (!Number.isNaN(parsed)) since = new Date(parsed).toISOString();
  }

  const admin = createServiceClient();
  let query = admin.from("news").select("id", { count: "exact", head: true });

  if (since) {
    query = query.gt("created_at", since);
  }

  const { count } = await query;
  return (count ?? 0) > 0;
}

export async function deleteNews(id: string): Promise<{ error: string }> {
  const auth = await requireRole(["admin", "board"], "Nur Admins/Vorstand dürfen News entfernen.");
  if (!auth.ok) return { error: auth.error };
  if (!isSafeId(id)) return { error: "Ungültige Auswahl." };

  const admin = createServiceClient();

  const { error } = await admin.from("news").delete().eq("id", id);
  if (error) {
    console.error("deleteNews:", error);
    return { error: "News konnte nicht entfernt werden." };
  }

  revalidatePath("/news");
  revalidatePath("/", "layout");
  return { error: "" };
}
