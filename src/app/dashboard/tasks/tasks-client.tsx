"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare, Plus, Repeat, Check, Trash2, RotateCcw, ChevronRight, Lock, Search as SearchIcon } from "lucide-react";
import { RecurringModal } from "./recurring-modal";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";

export type TaskRow = {
  id: string;
  board: "admin" | "marketing";
  title: string;
  description: string | null;
  assigned_by_user_id: string;
  assigned_to_user_id: string | null;
  priority: string | null;
  due_date: string | null;
  status: string;
  work_link: string | null;
  proposed_caption: string | null;
  post_date: string | null;
  brand: string | null;
  is_private: boolean;
  acknowledged_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export const BRANDS = ["NJJ", "NJF", "CSM", "TBM", "OTHER"] as const;
export type Member = { user_id: string; display_name: string };
export type TaskTemplate = {
  id: string;
  board: "admin" | "marketing";
  title: string;
  description: string | null;
  assigned_to_user_id: string | null;
  priority: string | null;
  cadence: "daily" | "weekly" | "monthly";
  weekday: number | null;
  day_of_month: number | null;
  lead_days: number;
  active: boolean;
};
type Board = "admin" | "marketing";
type Tab = "portfolio" | "operations" | "marketing";

const STATUSES: Record<Board, string[]> = {
  admin: ["pending", "in_progress", "blocked", "done"],
  marketing: ["pending", "approved", "revise", "scheduled", "posted"],
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", in_progress: "In progress", blocked: "Blocked", done: "Done",
  approved: "Approved", revise: "Revise", scheduled: "Scheduled", posted: "Posted",
};
const STATUS_TONE: Record<string, string> = {
  pending: "bg-creamDk text-inkSoft", in_progress: "bg-periBg text-peri", blocked: "bg-salmonBg text-coral",
  done: "bg-greenBg text-green", approved: "bg-greenBg text-green", revise: "bg-salmonBg text-coral",
  scheduled: "bg-periBg text-peri", posted: "bg-berryBg text-berry",
};
const PRIORITIES = ["low", "normal", "high", "urgent"];

const isDone = (t: TaskRow) => t.status === "done" || t.status === "posted";
const dateOf = (t: TaskRow) => (t.board === "marketing" ? t.post_date : t.due_date);
function phToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function TasksClient({
  currentUserId,
  canAssign,
  tasks,
  members,
  templates,
}: {
  currentUserId: string;
  canAssign: boolean;
  tasks: TaskRow[];
  members: Member[];
  templates: TaskTemplate[];
}) {
  const [tab, setTab] = React.useState<Tab>("portfolio");
  const [newTask, setNewTask] = React.useState<{ board: Board; isPrivate: boolean } | null>(null);
  const [showRecurring, setShowRecurring] = React.useState(false);
  const [openTask, setOpenTask] = React.useState<TaskRow | null>(null);

  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.display_name ?? "—" : "Unassigned";

  const live = tasks.filter((t) => !t.deleted_at);
  const deleted = tasks.filter((t) => t.deleted_at);

  // Portfolio scopes (mine)
  const myPrivate = live.filter((t) => t.is_private && t.assigned_to_user_id === currentUserId);
  const assignedToMe = live.filter((t) => !t.is_private && t.assigned_to_user_id === currentUserId);
  const opsTasks = live.filter((t) => t.board === "admin" && !t.is_private);
  const mktTasks = live.filter((t) => t.board === "marketing" && !t.is_private);

  // Search / brand filter / sort — applied across all boards.
  const [query, setQuery] = React.useState("");
  const [brandF, setBrandF] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"date" | "priority" | "created" | "title">("date");
  const view = React.useCallback(
    (rows: TaskRow[]): TaskRow[] => {
      const q = query.trim().toLowerCase();
      let r = rows;
      if (brandF) r = r.filter((t) => t.brand === brandF);
      if (q) r = r.filter((t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || (t.brand ?? "").toLowerCase().includes(q));
      const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return [...r].sort((a, b) => {
        if (sortBy === "date") return (dateOf(a) ?? "9999-12-31").localeCompare(dateOf(b) ?? "9999-12-31");
        if (sortBy === "priority") return (rank[a.priority ?? ""] ?? 5) - (rank[b.priority ?? ""] ?? 5);
        if (sortBy === "title") return a.title.localeCompare(b.title);
        return b.created_at.localeCompare(a.created_at);
      });
    },
    [query, brandF, sortBy],
  );

  const newLabel = tab === "portfolio" ? "New private task" : tab === "operations" ? "New task" : "New post";

  function startNew() {
    if (tab === "portfolio") setNewTask({ board: "admin", isPrivate: true });
    else if (tab === "operations") setNewTask({ board: "admin", isPrivate: false });
    else setNewTask({ board: "marketing", isPrivate: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">Tasks</h1>
          <p className="text-sm text-inkSoft mt-1">Your portfolio, the team&rsquo;s operations, and marketing — all in one place.</p>
        </div>
        <div className="flex gap-2">
          {canAssign ? (
            <Button variant="ghost" onClick={() => setShowRecurring(true)}><Repeat className="w-4 h-4 mr-1.5" /> Recurring</Button>
          ) : null}
          <Button onClick={startNew}><Plus className="w-4 h-4" /> {newLabel}</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["portfolio", "Portfolio"], ["operations", "Operations"], ["marketing", "Marketing"]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition",
              tab === t ? "text-berry border-berry" : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search / filter / sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <SearchIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" className="pl-8" />
        </div>
        <Select value={brandF} onChange={(e) => setBrandF(e.target.value)} className="w-36" aria-label="Filter by brand">
          <option value="">All brands</option>
          {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="w-40" aria-label="Sort by">
          <option value="date">Sort: Due / post date</option>
          <option value="priority">Sort: Priority</option>
          <option value="title">Sort: Title</option>
          <option value="created">Sort: Newest</option>
        </Select>
      </div>

      {tab === "portfolio" ? (
        <div className="space-y-6">
          <BoardSection title="My private tasks" hint="Only you can see these." rows={view(myPrivate)} mode="admin" showAssignee={false} nameOf={nameOf} onOpen={setOpenTask} defaultOpen />
          <BoardSection title="Assigned to me" hint="Tasks others gave you." rows={view(assignedToMe)} mode="mixed" showAssignee={false} nameOf={nameOf} onOpen={setOpenTask} defaultOpen />
          <DeletedSection rows={view(deleted.filter((t) => t.assigned_to_user_id === currentUserId))} mode="mixed" nameOf={nameOf} onOpen={setOpenTask} />
        </div>
      ) : tab === "operations" ? (
        <div className="space-y-6">
          <BoardSection title="Open" rows={view(opsTasks)} mode="admin" showAssignee nameOf={nameOf} onOpen={setOpenTask} defaultOpen />
          <DeletedSection rows={view(deleted.filter((t) => t.board === "admin" && !t.is_private))} mode="admin" nameOf={nameOf} onOpen={setOpenTask} />
        </div>
      ) : (
        <div className="space-y-6">
          <BoardSection title="Open" rows={view(mktTasks)} mode="marketing" showAssignee nameOf={nameOf} onOpen={setOpenTask} defaultOpen />
          <DeletedSection rows={view(deleted.filter((t) => t.board === "marketing" && !t.is_private))} mode="marketing" nameOf={nameOf} onOpen={setOpenTask} />
        </div>
      )}

      {newTask ? (
        <TaskFormModal
          board={newTask.board}
          isPrivate={newTask.isPrivate}
          canAssign={canAssign}
          currentUserId={currentUserId}
          members={members}
          onClose={() => setNewTask(null)}
        />
      ) : null}
      {showRecurring ? <RecurringModal templates={templates} members={members} onClose={() => setShowRecurring(false)} /> : null}
      {openTask ? (
        <TaskDetailModal
          task={openTask}
          members={members}
          currentUserId={currentUserId}
          canAssign={canAssign}
          nameOf={nameOf}
          onClose={() => setOpenTask(null)}
        />
      ) : null}
    </div>
  );
}

/* ---- Board section: open list + collapsible Completed ---- */
type Mode = "admin" | "marketing" | "mixed";

function BoardSection({
  title, hint, rows, mode, showAssignee, nameOf, onOpen, defaultOpen, currentUserId,
}: {
  title: string; hint?: string; rows: TaskRow[]; mode: Mode; showAssignee: boolean;
  nameOf: (id: string | null) => string; onOpen: (t: TaskRow) => void; defaultOpen?: boolean; currentUserId?: string;
}) {
  const open = rows.filter((t) => !isDone(t));
  const completed = rows.filter((t) => isDone(t));
  const [showDone, setShowDone] = React.useState(false);

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="font-serif font-bold text-lg text-ink">{title}</h2>
        {hint ? <span className="text-xs text-inkSoft">{hint}</span> : null}
      </div>
      {open.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-6 text-center text-sm text-inkSoft">Nothing open here. 🎉</div>
      ) : (
        <TaskTable rows={open} mode={mode} showAssignee={showAssignee} nameOf={nameOf} onOpen={onOpen} currentUserId={currentUserId} />
      )}
      {completed.length > 0 ? (
        <div className="mt-2">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-inkSoft hover:text-ink">
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", showDone && "rotate-90")} />
            Completed · {completed.length}
          </button>
          {showDone ? <div className="mt-1"><TaskTable rows={completed} mode={mode} showAssignee={showAssignee} nameOf={nameOf} onOpen={onOpen} dim /></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function DeletedSection({ rows, mode, nameOf, onOpen }: { rows: TaskRow[]; mode: Mode; nameOf: (id: string | null) => string; onOpen: (t: TaskRow) => void }) {
  const [show, setShow] = React.useState(false);
  if (rows.length === 0) return null;
  return (
    <div>
      <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-inkSoft hover:text-ink">
        <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", show && "rotate-90")} />
        <Trash2 className="w-3.5 h-3.5" /> Deleted · {rows.length}
      </button>
      {show ? <div className="mt-1"><TaskTable rows={rows} mode={mode} showAssignee nameOf={nameOf} onOpen={onOpen} dim /></div> : null}
    </div>
  );
}

function TaskTable({
  rows, mode, showAssignee, nameOf, onOpen, dim, currentUserId,
}: {
  rows: TaskRow[]; mode: Mode; showAssignee: boolean; nameOf: (id: string | null) => string;
  onOpen: (t: TaskRow) => void; dim?: boolean; currentUserId?: string;
}) {
  const today = phToday();
  return (
    <div className={cn("bg-white border border-border rounded-lg shadow-card overflow-x-auto", dim && "opacity-70")}>
      <table className="w-full text-sm">
        <thead className="bg-cream text-inkSoft">
          <tr>
            <th className="text-left font-semibold px-4 py-2">{mode === "marketing" ? "Content" : "Task"}</th>
            {mode === "mixed" ? <th className="text-left font-semibold px-4 py-2">Board</th> : null}
            {showAssignee ? <th className="text-left font-semibold px-4 py-2">Assignee</th> : null}
            {mode === "admin" ? <th className="text-left font-semibold px-4 py-2">Priority</th> : null}
            <th className="text-left font-semibold px-4 py-2">Brand</th>
            <th className="text-left font-semibold px-4 py-2">{mode === "marketing" ? "Post" : "Due"}</th>
            <th className="text-left font-semibold px-4 py-2">Link</th>
            <th className="text-left font-semibold px-4 py-2">Status</th>
            <th className="text-left font-semibold px-4 py-2">Ack</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => {
            const d = dateOf(t);
            const overdue = !!d && !isDone(t) && d < today;
            return (
              <tr key={t.id} onClick={() => onOpen(t)} className="cursor-pointer hover:bg-cream/40 transition">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 max-w-[280px]">
                    {t.is_private ? <Lock className="w-3 h-3 text-inkSoft shrink-0" /> : null}
                    <span className="font-medium text-ink truncate" title={t.title}>{t.title}</span>
                  </div>
                </td>
                {mode === "mixed" ? (
                  <td className="px-4 py-2.5"><span className="text-xs text-inkSoft capitalize">{t.board === "admin" ? "Ops" : "Marketing"}</span></td>
                ) : null}
                {showAssignee ? <td className="px-4 py-2.5 text-inkSoft whitespace-nowrap">{nameOf(t.assigned_to_user_id)}</td> : null}
                {mode === "admin" ? (
                  <td className="px-4 py-2.5">
                    {t.priority ? <span className={cn("capitalize", t.priority === "urgent" || t.priority === "high" ? "text-coral font-semibold" : "text-inkSoft")}>{t.priority}</span> : <span className="text-inkSoft/50">—</span>}
                  </td>
                ) : null}
                <td className="px-4 py-2.5">{t.brand ? <span className="inline-flex items-center rounded-full bg-periBg text-peri px-2 py-0.5 text-xs font-semibold">{t.brand}</span> : <span className="text-inkSoft/50">—</span>}</td>
                <td className={cn("px-4 py-2.5 whitespace-nowrap", overdue ? "text-coral font-semibold" : "text-inkSoft")}>{d ? (overdue ? `${formatDate(d)} · overdue` : formatDate(d)) : "—"}</td>
                <td className="px-4 py-2.5">{t.work_link ? <a href={t.work_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-berry hover:underline inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Open</a> : <span className="text-inkSoft/50">—</span>}</td>
                <td className="px-4 py-2.5"><span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[t.status] ?? "bg-creamDk text-inkSoft")}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                <td className="px-4 py-2.5">
                  {t.is_private ? <span className="text-inkSoft/40 text-xs">—</span>
                    : t.acknowledged_at ? <span className="text-green inline-flex items-center gap-0.5 text-xs font-semibold"><Check className="w-3.5 h-3.5" /></span>
                    : <span className="inline-block w-2 h-2 rounded-full bg-yellow" title="Not acknowledged yet" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TaskFormModal({
  board, isPrivate, canAssign, currentUserId, members, onClose, editing,
}: {
  board: Board; isPrivate: boolean; canAssign: boolean; currentUserId: string;
  members: Member[]; onClose: () => void; editing?: TaskRow;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [assignedTo, setAssignedTo] = React.useState(editing?.assigned_to_user_id ?? (canAssign && !isPrivate ? "" : currentUserId));
  const [priority, setPriority] = React.useState(editing?.priority ?? "normal");
  const [dueDate, setDueDate] = React.useState(editing?.due_date ?? "");
  const [workLink, setWorkLink] = React.useState(editing?.work_link ?? "");
  const [caption, setCaption] = React.useState(editing?.proposed_caption ?? "");
  const [postDate, setPostDate] = React.useState(editing?.post_date ?? "");
  const [brand, setBrand] = React.useState(editing?.brand ?? "NJJ");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const priv = editing ? editing.is_private : isPrivate;

  async function handleSave() {
    if (saving) return;
    setError(null);
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    const supabase = createClient();
    const args = {
      p_title: title.trim(),
      p_assigned_to: assignedTo || null,
      p_description: description.trim() || null,
      p_priority: board === "admin" ? priority : null,
      p_due_date: board === "admin" ? dueDate || null : null,
      p_work_link: workLink.trim() || null,
      p_proposed_caption: board === "marketing" ? caption.trim() || null : null,
      p_post_date: board === "marketing" ? postDate || null : null,
      p_brand: brand,
    };
    const { error: err } = editing
      ? await supabase.rpc("update_task", { p_task_id: editing.id, ...args })
      : await supabase.rpc("create_task", { p_board: board, ...args, p_is_private: priv });
    setSaving(false);
    if (err) return setError(err.message);
    toast.push(editing ? "Task updated" : "Task created", "success");
    onClose();
    router.refresh();
  }

  const heading = editing ? "Edit task" : priv ? "New private task" : board === "marketing" ? "New marketing post" : "New task";

  return (
    <Modal open onClose={saving ? () => {} : onClose} title={heading} size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Create"}</Button></>}>
      <div className="space-y-4">
        {priv ? <p className="text-xs text-inkSoft bg-cream/60 rounded-md px-3 py-2 inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private — only you will see this.</p> : null}
        <div className="space-y-1">
          <Label htmlFor="t_title" required>{board === "marketing" ? "Content / task" : "Task"}</Label>
          <Input id="t_title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        </div>

        {canAssign && !priv ? (
          <div className="space-y-1">
            <Label htmlFor="t_assignee">Assign to</Label>
            <Select id="t_assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={saving}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
            </Select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="t_brand">Project / brand</Label>
            <Select id="t_brand" value={brand} onChange={(e) => setBrand(e.target.value)} disabled={saving}>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t_link">Link (optional)</Label>
            <Input id="t_link" type="url" placeholder="https://…" value={workLink} onChange={(e) => setWorkLink(e.target.value)} disabled={saving} />
          </div>
        </div>

        {board === "admin" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="t_priority">Priority</Label>
              <Select id="t_priority" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={saving}>
                {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="t_due">Due date</Label>
              <DateInput id="t_due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={saving} />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="t_caption">Proposed caption</Label>
              <Textarea id="t_caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t_post">Post date</Label>
              <DateInput id="t_post" value={postDate} onChange={(e) => setPostDate(e.target.value)} disabled={saving} />
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label htmlFor="t_desc">{board === "marketing" ? "Notes" : "Description"}</Label>
          <Textarea id="t_desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
        </div>

        {error ? <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">{error}</p> : null}
      </div>
    </Modal>
  );
}

type Comment = { id: string; author_user_id: string; body: string; created_at: string };

function TaskDetailModal({
  task, members, currentUserId, canAssign, nameOf, onClose,
}: {
  task: TaskRow; members: Member[]; currentUserId: string; canAssign: boolean;
  nameOf: (id: string | null) => string; onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = React.useState(task.status);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [newComment, setNewComment] = React.useState("");
  const [postingComment, setPostingComment] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [acked, setAcked] = React.useState<string | null>(task.acknowledged_at);

  const deleted = !!task.deleted_at;
  const canChangeStatus = !deleted && (canAssign || task.assigned_to_user_id === currentUserId || task.assigned_by_user_id === currentUserId);
  const canEdit = !deleted && (canAssign || task.assigned_by_user_id === currentUserId || task.assigned_to_user_id === currentUserId);
  const canDelete = canAssign || task.assigned_by_user_id === currentUserId || task.assigned_to_user_id === currentUserId;
  const canAck = !deleted && !task.is_private && task.assigned_to_user_id === currentUserId && !acked;

  React.useEffect(() => {
    if (task.is_private) return;
    let active = true;
    const supabase = createClient();
    supabase.from("task_comments").select("id, author_user_id, body, created_at").eq("task_id", task.id).order("created_at", { ascending: true })
      .then(({ data }) => { if (active) setComments((data ?? []) as Comment[]); });
    return () => { active = false; };
  }, [task.id, task.is_private]);

  async function changeStatus(next: string) {
    setStatus(next);
    setSavingStatus(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_task_status", { p_task_id: task.id, p_status: next });
    setSavingStatus(false);
    if (error) { toast.push(error.message, "error"); setStatus(task.status); return; }
    toast.push("Status updated", "success");
    router.refresh();
  }
  async function acknowledge() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("acknowledge_task", { p_task_id: task.id });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    setAcked(new Date().toISOString());
    toast.push("Acknowledged", "success");
    router.refresh();
  }
  async function removeTask() {
    if (!confirm("Move this task to Deleted?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_task", { p_task_id: task.id });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Task deleted", "success");
    onClose();
    router.refresh();
  }
  async function restore() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("restore_task", { p_task_id: task.id });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Task restored", "success");
    onClose();
    router.refresh();
  }
  async function postComment() {
    if (postingComment || !newComment.trim()) return;
    setPostingComment(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_task_comment", { p_task_id: task.id, p_body: newComment.trim() });
    setPostingComment(false);
    if (error) return toast.push(error.message, "error");
    setComments((c) => [...c, { id: crypto.randomUUID(), author_user_id: currentUserId, body: newComment.trim(), created_at: new Date().toISOString() }]);
    setNewComment("");
  }

  if (editing) {
    return (
      <TaskFormModal board={task.board} isPrivate={task.is_private} canAssign={canAssign} currentUserId={currentUserId} members={members} editing={task}
        onClose={() => { setEditing(false); onClose(); }} />
    );
  }

  return (
    <Modal open onClose={onClose} title={task.title}
      description={`${task.is_private ? "Private · " : ""}${task.board === "marketing" ? "Marketing" : "Ops"} · by ${nameOf(task.assigned_by_user_id)}${task.is_private ? "" : ` · to ${nameOf(task.assigned_to_user_id)}`}`}
      size="md"
      footer={
        deleted ? (
          <><Button variant="ghost" onClick={onClose}>Close</Button>{canDelete ? <Button onClick={restore} disabled={busy}><RotateCcw className="w-4 h-4 mr-1" /> Restore</Button> : null}</>
        ) : (
          <>
            {canDelete ? <Button variant="dangerGhost" onClick={removeTask} disabled={busy}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button> : null}
            <span className="ml-auto" />
            {canEdit ? <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button> : null}
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        {deleted ? <p className="text-xs text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">This task is deleted. Restore it to bring it back.</p> : null}

        <div className="flex items-center gap-3 flex-wrap">
          <Label htmlFor="d_status" className="mb-0">Status</Label>
          {canChangeStatus ? (
            <Select id="d_status" value={status} onChange={(e) => changeStatus(e.target.value)} disabled={savingStatus} className="max-w-[200px]">
              {STATUSES[task.board].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          ) : (
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>{STATUS_LABEL[status] ?? status}</span>
          )}
          {!task.is_private ? (
            canAck ? (
              <Button onClick={acknowledge} disabled={busy} className="ml-auto"><Check className="w-4 h-4 mr-1" /> Acknowledge</Button>
            ) : acked ? (
              <span className="ml-auto inline-flex items-center gap-1 text-green text-xs font-semibold"><Check className="w-4 h-4" /> Acknowledged {formatDate(acked)}</span>
            ) : task.assigned_to_user_id ? (
              <span className="ml-auto text-xs text-yellow font-semibold">Awaiting acknowledgement</span>
            ) : null
          ) : null}
        </div>

        {task.board === "admin" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 text-inkSoft">
              <div><span className="text-xs uppercase tracking-smallcaps">Priority</span><div className="text-ink capitalize">{task.priority ?? "—"}</div></div>
              <div><span className="text-xs uppercase tracking-smallcaps">Due</span><div className="text-ink">{task.due_date ? formatDate(task.due_date) : "—"}</div></div>
            </div>
            {task.brand ? <div className="text-inkSoft"><span className="text-xs uppercase tracking-smallcaps">Project / brand</span><div className="text-ink font-semibold">{task.brand}</div></div> : null}
            {task.work_link ? <a href={task.work_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-berry hover:underline"><ExternalLink className="w-4 h-4" /> Open link</a> : null}
          </div>
        ) : (
          <div className="space-y-2">
            {task.brand ? <div className="text-inkSoft"><span className="text-xs uppercase tracking-smallcaps">Brand</span><div className="text-ink font-semibold">{task.brand}</div></div> : null}
            {task.work_link ? <a href={task.work_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-berry hover:underline"><ExternalLink className="w-4 h-4" /> Open work link</a> : null}
            {task.post_date ? <div className="text-inkSoft"><span className="text-xs uppercase tracking-smallcaps">Post date</span><div className="text-ink">{formatDate(task.post_date)}</div></div> : null}
            {task.proposed_caption ? <div><span className="text-xs uppercase tracking-smallcaps text-inkSoft">Proposed caption</span><p className="text-ink whitespace-pre-wrap mt-0.5 rounded-md bg-cream/50 border border-border p-2">{task.proposed_caption}</p></div> : null}
          </div>
        )}

        {task.description ? <div><span className="text-xs uppercase tracking-smallcaps text-inkSoft">{task.board === "marketing" ? "Notes" : "Description"}</span><p className="text-ink whitespace-pre-wrap mt-0.5">{task.description}</p></div> : null}

        {!task.is_private ? (
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2"><MessageSquare className="w-3.5 h-3.5" /> Comments / queries</div>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {comments.length === 0 ? <p className="text-inkSoft text-xs">No comments yet.</p> : comments.map((c) => (
                <div key={c.id} className="rounded-md bg-cream/50 border border-border px-3 py-2">
                  <div className="text-[11px] text-inkSoft">{nameOf(c.author_user_id)} · {formatDate(c.created_at)}</div>
                  <div className="text-ink whitespace-pre-wrap">{c.body}</div>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2 mt-2">
              <Textarea rows={1} value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment or query…" disabled={postingComment} />
              <Button onClick={postComment} disabled={postingComment || !newComment.trim()}>Send</Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
