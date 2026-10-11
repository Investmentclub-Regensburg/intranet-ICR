"use client";

import { useMemo, useOptimistic, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Flag,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IconButton } from "@/components/kit/IconButton";
import { Segmented } from "@/components/kit/Segmented";
import { cn } from "@/lib/utils";
import {
  createTask,
  deleteTask,
  moveTask,
  setTaskArchived,
  updateTask,
  type BoardData,
  type BoardMember,
  type BoardTask,
  type TaskInput,
  type TaskPriority,
  type TaskStatus,
} from "@/app/(intranet)/admin/tasks/actions";

// Kanban für Vorstand/Admins: drei Spalten (Geplant, In Arbeit, Erledigt), Karten per Drag & Drop
// oder Pfeil-Knöpfen verschieben, Klick öffnet die Bearbeitung. Erledigt zeigt nur die neuesten
// fünf, Älteres liegt im Archiv. Deadline-Erinnerungen verschickt die Datenbank (pg_cron).

const COLUMNS: { key: TaskStatus; label: string; dot: string }[] = [
  { key: "planned", label: "Geplant", dot: "bg-ink-mute" },
  { key: "in_progress", label: "In Arbeit", dot: "bg-primary" },
  { key: "done", label: "Erledigt", dot: "bg-success" },
];

const PRIORITY: Record<TaskPriority, { label: string; rank: number; className: string }> = {
  high: { label: "Hoch", rank: 0, className: "bg-destructive/10 text-destructive" },
  normal: { label: "Normal", rank: 1, className: "bg-muted text-ink-soft" },
  low: { label: "Niedrig", rank: 2, className: "bg-muted text-muted-foreground" },
};

const PRIORITY_OPTIONS = [
  { key: "low", label: "Niedrig" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "Hoch" },
] as const;

function todayBerlin(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

function daysUntil(deadline: string): number {
  return Math.round((Date.parse(deadline) - Date.parse(todayBerlin())) / 86_400_000);
}

function formatDeadline(deadline: string): string {
  const d = daysUntil(deadline);
  if (d === 0) return "Heute";
  if (d === 1) return "Morgen";
  if (d === -1) return "Seit gestern";
  if (d < 0) return `Seit ${-d} Tagen`;
  const [y, m, day] = deadline.split("-");
  return d < 7 ? `In ${d} Tagen` : `${day}.${m}.${y}`;
}

/** Sortierung in der Spalte: Priorität, dann Deadline (ohne Deadline zuletzt), dann Anlage. */
function sortTasks(a: BoardTask, b: BoardTask): number {
  if (a.status === "done" && b.status === "done") return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
  return (
    PRIORITY[a.priority].rank - PRIORITY[b.priority].rank ||
    (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

const EMPTY_INPUT: TaskInput = {
  title: "",
  description: "",
  status: "planned",
  priority: "normal",
  deadline: null,
  assigneeIds: [],
};

export function TaskBoard({ data }: { data: BoardData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState<{ task: BoardTask | null; input: TaskInput } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const [tasks, applyMove] = useOptimistic(data.tasks, (state, move: { id: string; status: TaskStatus }) =>
    state.map((t) =>
      t.id === move.id
        ? { ...t, status: move.status, completedAt: move.status === "done" ? new Date().toISOString() : null }
        : t,
    ),
  );

  const members = useMemo(() => new Map(data.members.map((m) => [m.id, m])), [data.members]);
  const visible = onlyMine && data.meId ? tasks.filter((t) => t.assigneeIds.includes(data.meId!)) : tasks;

  function move(task: BoardTask, status: TaskStatus) {
    if (task.status === status) return;
    startTransition(async () => {
      applyMove({ id: task.id, status });
      const { error } = await moveTask(task.id, status);
      if (error) toast.error(error);
      router.refresh();
    });
  }

  function run(action: () => Promise<{ error?: string }>, success?: string) {
    startTransition(async () => {
      const { error } = await action();
      if (error) {
        toast.error(error);
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    setOverColumn(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    const task = tasks.find((t) => t.id === id);
    setDragId(null);
    if (task) move(task, status);
  }

  if (!data.available) {
    return (
      <p className="rounded-2xl border border-dashed border-input px-5 py-8 text-center text-sm text-muted-foreground">
        Das Aufgaben-Board ist bereit, sobald die Migration <code className="text-xs">board_tasks</code> in der
        Datenbank ausgeführt ist.
      </p>
    );
  }

  return (
    <section aria-labelledby="board-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="board-title" className="text-xl font-bold tracking-[-0.02em]">
            Aufgaben-Board
          </h2>
          <p className="text-sm text-muted-foreground">
            To-dos für Vorstand und Admins. Bei nahender Deadline bekommen alle Zuständigen eine E-Mail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.meId && (
            <Segmented
              layoutId="board-filter"
              radio
              ariaLabel="Aufgaben filtern"
              options={[
                { key: "all", label: "Alle" },
                { key: "mine", label: "Meine" },
              ]}
              value={onlyMine ? "mine" : "all"}
              onChange={(key) => setOnlyMine(key === "mine")}
            />
          )}
          <Button onClick={() => setEditing({ task: null, input: { ...EMPTY_INPUT, assigneeIds: data.meId ? [data.meId] : [] } })}>
            <Plus aria-hidden />
            Neue Aufgabe
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col, ci) => {
          const items = visible.filter((t) => t.status === col.key).sort(sortTasks);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overColumn !== col.key) setOverColumn(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverColumn(null);
              }}
              onDrop={(e) => onDrop(e, col.key)}
              className={cn(
                "flex min-h-48 flex-col gap-2.5 rounded-2xl border bg-muted/40 p-3 transition-colors",
                overColumn === col.key ? "border-primary/50 bg-primary/[0.04]" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 px-1 pt-0.5 pb-1">
                <span className={cn("size-2 rounded-full", col.dot)} aria-hidden />
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>
              </div>

              {items.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {col.key === "done" ? "Noch nichts erledigt." : "Keine Aufgaben. Karten hierher ziehen."}
                </p>
              )}

              {items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assignees={task.assigneeIds.flatMap((id) => members.get(id) ?? [])}
                  dragging={dragId === task.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(task.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverColumn(null);
                  }}
                  onOpen={() =>
                    setEditing({
                      task,
                      input: {
                        title: task.title,
                        description: task.description,
                        status: task.status,
                        priority: task.priority,
                        deadline: task.deadline,
                        assigneeIds: task.assigneeIds,
                      },
                    })
                  }
                  onPrev={ci > 0 ? () => move(task, COLUMNS[ci - 1].key) : undefined}
                  onNext={ci < COLUMNS.length - 1 ? () => move(task, COLUMNS[ci + 1].key) : undefined}
                  prevLabel={ci > 0 ? COLUMNS[ci - 1].label : ""}
                  nextLabel={ci < COLUMNS.length - 1 ? COLUMNS[ci + 1].label : ""}
                  onArchive={
                    col.key === "done"
                      ? () => run(() => setTaskArchived(task.id, true), "Aufgabe archiviert.")
                      : undefined
                  }
                />
              ))}

              {col.key === "done" && (
                <p className="px-1 pt-1 text-xs text-muted-foreground">
                  Sichtbar sind die fünf zuletzt erledigten Aufgaben, ältere wandern ins Archiv.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {data.archived.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-left text-sm font-semibold outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <span className="flex items-center gap-2">
              <Archive className="size-4 text-muted-foreground" aria-hidden />
              Archiv
              <span className="font-normal text-muted-foreground tabular-nums">{data.archived.length}</span>
            </span>
            <ChevronDown
              className={cn("size-4 text-muted-foreground transition-transform", showArchive && "rotate-180")}
              aria-hidden
            />
          </button>
          {showArchive && (
            <ul className="divide-y divide-border border-t border-border">
              {data.archived.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.assigneeIds.length > 0
                        ? task.assigneeIds.map((id) => members.get(id)?.name ?? "Ehemalig").join(", ")
                        : "Niemand zugewiesen"}
                      {task.completedAt &&
                        ` · erledigt am ${new Date(task.completedAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`}
                    </p>
                  </div>
                  <IconButton
                    label={`${task.title}: wiederherstellen`}
                    hint="Wiederherstellen: zurück in die Spalte „Erledigt“"
                    onClick={() => run(() => setTaskArchived(task.id, false), "Aufgabe wiederhergestellt.")}
                  >
                    <ArchiveRestore />
                  </IconButton>
                  <IconButton
                    label={`${task.title}: endgültig löschen`}
                    hint="Endgültig löschen"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`„${task.title}“ endgültig löschen?`)) {
                        run(() => deleteTask(task.id), "Aufgabe gelöscht.");
                      }
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && (
        <TaskDialog
          key={editing.task?.id ?? "new"}
          task={editing.task}
          initial={editing.input}
          members={data.members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function TaskCard({
  task,
  assignees,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  onArchive,
}: {
  task: BoardTask;
  assignees: BoardMember[];
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel: string;
  nextLabel: string;
  onArchive?: () => void;
}) {
  const days = task.deadline ? daysUntil(task.deadline) : null;
  const open = task.status !== "done";
  const deadlineTone =
    days === null || !open
      ? "text-muted-foreground"
      : days < 0
        ? "text-destructive"
        : days <= 2
          ? "text-primary"
          : "text-muted-foreground";

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-xl border border-border bg-card p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow,opacity] hover:border-edge hover:shadow-glow",
        dragging && "opacity-50",
        !open && "opacity-80",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm leading-snug font-semibold", !open && "text-muted-foreground line-through")}>
            {task.title}
          </p>
          {task.priority !== "normal" && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
                PRIORITY[task.priority].className,
              )}
            >
              <Flag className="size-3" aria-hidden />
              {PRIORITY[task.priority].label}
            </span>
          )}
        </div>
        {task.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{task.description}</p>
        )}
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5 text-xs">
          <AssigneeStack assignees={assignees} />
          {task.deadline && (
            <span className={cn("flex shrink-0 items-center gap-1 font-medium", deadlineTone)}>
              <CalendarClock className="size-3.5" aria-hidden />
              {formatDeadline(task.deadline)}
            </span>
          )}
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
          {onPrev && (
            <IconButton label={`Nach „${prevLabel}“ verschieben`} className="size-7" onClick={onPrev}>
              <ArrowLeft />
            </IconButton>
          )}
          {onNext && (
            <IconButton label={`Nach „${nextLabel}“ verschieben`} className="size-7" onClick={onNext}>
              <ArrowRight />
            </IconButton>
          )}
          {onArchive && (
            <IconButton label="Ins Archiv verschieben" className="size-7" onClick={onArchive}>
              <Archive />
            </IconButton>
          )}
        </div>
      </div>
    </article>
  );
}

const STACK_MAX = 3;

/** Zuständige als überlappende Initialen; bei einer Person zusätzlich der Vorname. */
function AssigneeStack({ assignees }: { assignees: BoardMember[] }) {
  if (assignees.length === 0) return <span className="text-muted-foreground">Niemand</span>;
  const shown = assignees.slice(0, STACK_MAX);
  const rest = assignees.length - shown.length;
  const names = assignees.map((a) => a.name).join(", ");
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={names}>
      <span className="flex shrink-0 -space-x-1" aria-label={`Zuständig: ${names}`} role="img">
        {shown.map((a) => (
          <span
            key={a.id}
            className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.5625rem] font-semibold text-primary-foreground ring-2 ring-card"
          >
            {a.initials}
          </span>
        ))}
        {rest > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[0.5625rem] font-semibold text-ink-soft ring-2 ring-card">
            +{rest}
          </span>
        )}
      </span>
      {assignees.length === 1 && (
        <span className="truncate text-muted-foreground">{assignees[0].name.split(" ")[0]}</span>
      )}
    </span>
  );
}

/** Auswahlliste wie ein Select, aber mit Mehrfachauswahl; bleibt beim Anklicken offen. */
function AssigneeSelect({
  id,
  members,
  value,
  onToggle,
  onClear,
}: {
  id: string;
  members: BoardMember[];
  value: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const selected = members.filter((m) => value.includes(m.id));
  const label =
    value.length === 0
      ? "Niemand"
      : selected.length === 1
        ? selected[0].name
        : `${selected[0]?.name.split(" ")[0] ?? "Ehemalig"} +${value.length - 1}`;
  return (
    <Popover>
      <PopoverTrigger
        id={id}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        title={selected.map((m) => m.name).join(", ") || undefined}
      >
        <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-(--radix-popover-content-available-height) w-(--radix-popover-trigger-width) min-w-56 overflow-y-auto rounded-lg p-1 shadow-soft"
      >
        <div role="listbox" aria-multiselectable="true" aria-label="Zuständig">
          <button
            type="button"
            role="option"
            aria-selected={value.length === 0}
            onClick={onClear}
            className="relative flex w-full items-center rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent"
          >
            Niemand
            {value.length === 0 && <Check className="absolute right-2 size-4 text-muted-foreground" aria-hidden />}
          </button>
          {members.map((m) => {
            const isSelected = value.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onToggle(m.id)}
                className="relative flex w-full items-center rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent"
              >
                {m.name}
                {m.role === "admin" ? " (Admin)" : ""}
                {isSelected && <Check className="absolute right-2 size-4 text-muted-foreground" aria-hidden />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TaskDialog({
  task,
  initial,
  members,
  onClose,
  onSaved,
}: {
  task: BoardTask | null;
  initial: TaskInput;
  members: BoardMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState<TaskInput>(initial);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setInput((v) => ({ ...v, [key]: value }));
  const toggleAssignee = (id: string) =>
    setInput((v) => ({
      ...v,
      assigneeIds: v.assigneeIds.includes(id) ? v.assigneeIds.filter((x) => x !== id) : [...v.assigneeIds, id],
    }));

  function save() {
    startTransition(async () => {
      const { error } = task ? await updateTask(task.id, input) : await createTask(input);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(task ? "Aufgabe gespeichert." : "Aufgabe angelegt.");
      onSaved();
    });
  }

  function remove() {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const { error } = await deleteTask(task.id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Aufgabe gelöscht.");
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
          <DialogDescription>
            Zuständig können ein oder mehrere Vorstände und Admins sein. Mit Deadline bekommen alle Zuständigen zwei
            Tage vorher und am Tag selbst eine E-Mail.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Titel</Label>
            <Input
              id="task-title"
              value={input.title}
              maxLength={200}
              required
              autoFocus
              placeholder="z. B. Raum für die Mitgliederversammlung buchen"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Beschreibung (optional)</Label>
            <textarea
              id="task-description"
              value={input.description}
              maxLength={4000}
              rows={3}
              onChange={(e) => set("description", e.target.value)}
              className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 md:text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-assignees">Zuständig</Label>
              <AssigneeSelect
                id="task-assignees"
                members={members}
                value={input.assigneeIds}
                onToggle={toggleAssignee}
                onClear={() => set("assigneeIds", [])}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-status">Status</Label>
              <Select value={input.status} onValueChange={(v) => set("status", v as TaskStatus)}>
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label id="task-priority-label">Priorität</Label>
              <Segmented
                layoutId="task-priority"
                radio
                fill
                ariaLabel="Priorität"
                options={PRIORITY_OPTIONS}
                value={input.priority}
                onChange={(key) => set("priority", key)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-deadline">Deadline (optional)</Label>
              <Input
                id="task-deadline"
                type="date"
                value={input.deadline ?? ""}
                onChange={(e) => set("deadline", e.target.value || null)}
              />
            </div>
          </div>

          <DialogFooter className="items-center gap-2 pt-2 sm:justify-between">
            {task ? (
              <Button type="button" variant={confirmDelete ? "destructive" : "ghost"} onClick={remove} disabled={pending}>
                <Trash2 aria-hidden />
                {confirmDelete ? "Wirklich löschen?" : "Löschen"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending || !input.title.trim()}>
                {task ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
