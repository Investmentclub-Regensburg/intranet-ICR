"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/utils/supabase/guards";
import { createServiceClient } from "@/utils/supabase/service";
import { isUuid } from "@/lib/validation";

// Aufgaben-Board für Vorstand und Admins (Tabelle board_tasks, Migration 20261009130000).
// Zugriff nur hier über die Service Role nach requireRole(["admin", "board"]).

export type TaskStatus = "planned" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high";

export type BoardTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** YYYY-MM-DD oder null */
  deadline: string | null;
  assigneeId: string | null;
  createdById: string | null;
  createdAt: string;
  completedAt: string | null;
  archivedAt: string | null;
};

export type BoardMember = { id: string; name: string; initials: string; role: "admin" | "board" };

export type BoardData = {
  /** false, solange die Tabelle fehlt (Migration nicht ausgeführt). */
  available: boolean;
  tasks: BoardTask[];
  archived: BoardTask[];
  members: BoardMember[];
  /** Profil-ID der angemeldeten Person (für „Nur meine“). */
  meId: string | null;
};

export type TaskInput = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  assigneeId: string | null;
};

/** In der Spalte „Erledigt“ sichtbar; ältere erledigte Aufgaben gehen automatisch ins Archiv. */
const DONE_VISIBLE = 5;
const ARCHIVE_LIMIT = 100;
const STATUSES: readonly TaskStatus[] = ["planned", "in_progress", "done"];
const PRIORITIES: readonly TaskPriority[] = ["low", "normal", "high"];
const TASK_COLUMNS =
  "id, title, description, status, priority, deadline, assignee_profile_id, created_by, created_at, completed_at, archived_at";

async function guard() {
  return requireRole(["admin", "board"], "Nur für Vorstand und Admins.");
}

function toTask(raw: Record<string, unknown>): BoardTask {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    status: (STATUSES as readonly string[]).includes(String(raw.status)) ? (raw.status as TaskStatus) : "planned",
    priority: (PRIORITIES as readonly string[]).includes(String(raw.priority))
      ? (raw.priority as TaskPriority)
      : "normal",
    deadline: raw.deadline ? String(raw.deadline).slice(0, 10) : null,
    assigneeId: raw.assignee_profile_id ? String(raw.assignee_profile_id) : null,
    createdById: raw.created_by ? String(raw.created_by) : null,
    createdAt: String(raw.created_at ?? ""),
    completedAt: raw.completed_at ? String(raw.completed_at) : null,
    archivedAt: raw.archived_at ? String(raw.archived_at) : null,
  };
}

async function loadMembers(admin: ReturnType<typeof createServiceClient>): Promise<BoardMember[]> {
  const { data, error } = await admin
    .from("profiles")
    .select('id, "Vorname", "Nachname", "Rolle", "Status"')
    .in("Rolle", ["admin", "board"]);
  if (error) return [];
  return (data ?? [])
    .map((p) => p as Record<string, unknown>)
    .filter((p) => String(p["Status"] ?? "").toLowerCase() !== "cancelled")
    .map((p) => {
      const vorname = String(p["Vorname"] ?? "").trim();
      const nachname = String(p["Nachname"] ?? "").trim();
      return {
        id: String(p.id),
        name: `${vorname} ${nachname}`.trim() || "Ohne Namen",
        initials: `${vorname.charAt(0)}${nachname.charAt(0)}`.toUpperCase() || "?",
        role: String(p["Rolle"]) === "admin" ? ("admin" as const) : ("board" as const),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function getBoardData(): Promise<BoardData> {
  const empty: BoardData = { available: false, tasks: [], archived: [], members: [], meId: null };
  const auth = await guard();
  if (!auth.ok) return empty;

  const admin = createServiceClient();
  const [tasksRes, archivedRes, members] = await Promise.all([
    admin.from("board_tasks").select(TASK_COLUMNS).is("archived_at", null).order("created_at", { ascending: true }),
    admin
      .from("board_tasks")
      .select(TASK_COLUMNS)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(ARCHIVE_LIMIT),
    loadMembers(admin),
  ]);
  if (tasksRes.error) return { ...empty, members };

  return {
    available: true,
    tasks: (tasksRes.data ?? []).map((r) => toTask(r as Record<string, unknown>)),
    archived: (archivedRes.data ?? []).map((r) => toTask(r as Record<string, unknown>)),
    members,
    meId: auth.profile?.id ? String(auth.profile.id) : null,
  };
}

type Valid = { ok: true; row: Record<string, unknown> } | { ok: false; error: string };

async function validate(input: TaskInput, admin: ReturnType<typeof createServiceClient>): Promise<Valid> {
  const title = String(input.title ?? "").trim();
  const description = String(input.description ?? "").trim();
  if (!title) return { ok: false, error: "Bitte einen Titel angeben." };
  if (title.length > 200) return { ok: false, error: "Der Titel ist zu lang (max. 200 Zeichen)." };
  if (description.length > 4000) return { ok: false, error: "Die Beschreibung ist zu lang (max. 4000 Zeichen)." };
  if (!STATUSES.includes(input.status)) return { ok: false, error: "Ungültiger Status." };
  if (!PRIORITIES.includes(input.priority)) return { ok: false, error: "Ungültige Priorität." };

  let deadline: string | null = null;
  if (input.deadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || Number.isNaN(new Date(input.deadline).getTime())) {
      return { ok: false, error: "Ungültige Deadline." };
    }
    deadline = input.deadline;
  }

  let assignee: string | null = null;
  if (input.assigneeId) {
    if (!isUuid(input.assigneeId)) return { ok: false, error: "Ungültige Zuständigkeit." };
    const members = await loadMembers(admin);
    if (!members.some((m) => m.id === input.assigneeId)) {
      return { ok: false, error: "Zuweisen geht nur an Vorstand oder Admins." };
    }
    assignee = input.assigneeId;
  }

  return {
    ok: true,
    row: { title, description, status: input.status, priority: input.priority, deadline, assignee_profile_id: assignee },
  };
}

/** Erledigte Aufgaben über DONE_VISIBLE hinaus (älteste zuerst) ins Archiv schieben. */
async function trimDoneColumn(admin: ReturnType<typeof createServiceClient>) {
  const { data } = await admin
    .from("board_tasks")
    .select("id")
    .eq("status", "done")
    .is("archived_at", null)
    .order("completed_at", { ascending: false, nullsFirst: false });
  const overflow = (data ?? []).slice(DONE_VISIBLE).map((r) => String(r.id));
  if (overflow.length > 0) {
    await admin.from("board_tasks").update({ archived_at: new Date().toISOString() }).in("id", overflow);
  }
}

function statusFields(status: TaskStatus): Record<string, unknown> {
  return { status, completed_at: status === "done" ? new Date().toISOString() : null };
}

export async function createTask(input: TaskInput): Promise<{ error?: string }> {
  const auth = await guard();
  if (!auth.ok) return { error: auth.error };
  const admin = createServiceClient();
  const v = await validate(input, admin);
  if (!v.ok) return { error: v.error };

  const { error } = await admin.from("board_tasks").insert({
    ...v.row,
    ...statusFields(input.status),
    created_by: auth.profile?.id ?? null,
  });
  if (error) return { error: "Aufgabe konnte nicht angelegt werden." };
  if (input.status === "done") await trimDoneColumn(admin);
  revalidatePath("/admin");
  return {};
}

export async function updateTask(id: string, input: TaskInput): Promise<{ error?: string }> {
  const auth = await guard();
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(id)) return { error: "Ungültige Aufgabe." };
  const admin = createServiceClient();
  const v = await validate(input, admin);
  if (!v.ok) return { error: v.error };

  const { data: current } = await admin.from("board_tasks").select("status").eq("id", id).maybeSingle();
  if (!current) return { error: "Aufgabe nicht gefunden." };
  const statusChanged = current.status !== input.status;

  const { error } = await admin
    .from("board_tasks")
    .update({ ...v.row, ...(statusChanged ? statusFields(input.status) : {}), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Aufgabe konnte nicht gespeichert werden." };
  if (statusChanged && input.status === "done") await trimDoneColumn(admin);
  revalidatePath("/admin");
  return {};
}

export async function moveTask(id: string, status: TaskStatus): Promise<{ error?: string }> {
  const auth = await guard();
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(id) || !STATUSES.includes(status)) return { error: "Ungültige Eingabe." };
  const admin = createServiceClient();
  const { error } = await admin
    .from("board_tasks")
    .update({ ...statusFields(status), updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .neq("status", status);
  if (error) return { error: "Status konnte nicht geändert werden." };
  if (status === "done") await trimDoneColumn(admin);
  revalidatePath("/admin");
  return {};
}

export async function setTaskArchived(id: string, archived: boolean): Promise<{ error?: string }> {
  const auth = await guard();
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(id)) return { error: "Ungültige Aufgabe." };
  const admin = createServiceClient();
  // Wiederhergestellte Aufgaben kommen als „erledigt“ zurück; ins Archiv geht nur Erledigtes.
  const query = admin
    .from("board_tasks")
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  const { error } = archived ? await query.eq("status", "done") : await query;
  if (error) return { error: archived ? "Archivieren fehlgeschlagen." : "Wiederherstellen fehlgeschlagen." };
  revalidatePath("/admin");
  return {};
}

export async function deleteTask(id: string): Promise<{ error?: string }> {
  const auth = await guard();
  if (!auth.ok) return { error: auth.error };
  if (!isUuid(id)) return { error: "Ungültige Aufgabe." };
  const admin = createServiceClient();
  const { error } = await admin.from("board_tasks").delete().eq("id", id);
  if (error) return { error: "Aufgabe konnte nicht gelöscht werden." };
  revalidatePath("/admin");
  return {};
}
