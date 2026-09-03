"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare, Plus } from "lucide-react";
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
  created_at: string;
  updated_at: string;
};
export type Member = { user_id: string; display_name: string };
type Board = "admin" | "marketing";

const STATUSES: Record<Board, string[]> = {
  admin: ["pending", "in_progress", "blocked", "done"],
  marketing: ["pending", "approved", "revise", "scheduled", "posted"],
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  approved: "Approved",
  revise: "Revise",
  scheduled: "Scheduled",
  posted: "Posted",
};
const STATUS_TONE: Record<string, string> = {
  pending: "bg-creamDk text-inkSoft",
  in_progress: "bg-periBg text-peri",
  blocked: "bg-salmonBg text-coral",
  done: "bg-greenBg text-green",
  approved: "bg-greenBg text-green",
  revise: "bg-salmonBg text-coral",
  scheduled: "bg-periBg text-peri",
  posted: "bg-berryBg text-berry",
};
const PRIORITIES = ["low", "normal", "high", "urgent"];

export function TasksClient({
  currentUserId,
  canAssign,
  tasks,
  members,
}: {
  currentUserId: string;
  canAssign: boolean;
  tasks: TaskRow[];
  members: Member[];
}) {
  const [board, setBoard] = React.useState<Board>("admin");
  const [showNew, setShowNew] = React.useState(false);
  const [openTask, setOpenTask] = React.useState<TaskRow | null>(null);

  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.display_name ?? "—" : "Unassigned";
  const boardTasks = tasks.filter((t) => t.board === board);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">Tasks</h1>
          <p className="text-sm text-inkSoft mt-1">Assign work, track status, and comment.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" />
          New task
        </Button>
      </div>

      {/* Board tabs */}
      <div className="flex gap-2">
        {(["admin", "marketing"] as Board[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBoard(b)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold border transition capitalize",
              board === b
                ? "bg-berry text-white border-berry"
                : "bg-white text-ink border-border hover:bg-cream",
            )}
          >
            {b === "admin" ? "Admin" : "Marketing"}
          </button>
        ))}
      </div>

      {boardTasks.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-8 text-center text-sm text-inkSoft">
          No {board} tasks yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {boardTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenTask(t)}
              className="w-full text-left bg-white border border-border rounded-lg shadow-card p-4 hover:bg-cream/40 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">{t.title}</div>
                  <div className="text-xs text-inkSoft mt-0.5">
                    {board === "admin" ? (
                      <>
                        {nameOf(t.assigned_to_user_id)}
                        {t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
                        {t.priority ? ` · ${t.priority}` : ""}
                      </>
                    ) : (
                      <>
                        {nameOf(t.assigned_to_user_id)}
                        {t.post_date ? ` · post ${formatDate(t.post_date)}` : ""}
                        {t.work_link ? " · link attached" : ""}
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    STATUS_TONE[t.status] ?? "bg-creamDk text-inkSoft",
                  )}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showNew ? (
        <TaskFormModal
          board={board}
          canAssign={canAssign}
          currentUserId={currentUserId}
          members={members}
          onClose={() => setShowNew(false)}
        />
      ) : null}

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

function TaskFormModal({
  board,
  canAssign,
  currentUserId,
  members,
  onClose,
  editing,
}: {
  board: Board;
  canAssign: boolean;
  currentUserId: string;
  members: Member[];
  onClose: () => void;
  editing?: TaskRow;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [assignedTo, setAssignedTo] = React.useState(
    editing?.assigned_to_user_id ?? (canAssign ? "" : currentUserId),
  );
  const [priority, setPriority] = React.useState(editing?.priority ?? "normal");
  const [dueDate, setDueDate] = React.useState(editing?.due_date ?? "");
  const [workLink, setWorkLink] = React.useState(editing?.work_link ?? "");
  const [caption, setCaption] = React.useState(editing?.proposed_caption ?? "");
  const [postDate, setPostDate] = React.useState(editing?.post_date ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      p_work_link: board === "marketing" ? workLink.trim() || null : null,
      p_proposed_caption: board === "marketing" ? caption.trim() || null : null,
      p_post_date: board === "marketing" ? postDate || null : null,
    };
    const { error: err } = editing
      ? await supabase.rpc("update_task", { p_task_id: editing.id, ...args })
      : await supabase.rpc("create_task", { p_board: board, ...args });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.push(editing ? "Task updated" : "Task created", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={editing ? "Edit task" : `New ${board} task`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="t_title" required>
            {board === "marketing" ? "Content / task" : "Task"}
          </Label>
          <Input id="t_title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        </div>

        {canAssign ? (
          <div className="space-y-1">
            <Label htmlFor="t_assignee">Assign to</Label>
            <Select id="t_assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={saving}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
              ))}
            </Select>
          </div>
        ) : null}

        {board === "admin" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="t_priority">Priority</Label>
              <Select id="t_priority" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={saving}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
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
              <Label htmlFor="t_link">Work link (GDrive)</Label>
              <Input id="t_link" type="url" placeholder="https://drive.google.com/…" value={workLink} onChange={(e) => setWorkLink(e.target.value)} disabled={saving} />
            </div>
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

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">{error}</p>
        ) : null}
      </div>
    </Modal>
  );
}

type Comment = { id: string; author_user_id: string; body: string; created_at: string };

function TaskDetailModal({
  task,
  members,
  currentUserId,
  canAssign,
  nameOf,
  onClose,
}: {
  task: TaskRow;
  members: Member[];
  currentUserId: string;
  canAssign: boolean;
  nameOf: (id: string | null) => string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = React.useState(task.status);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [newComment, setNewComment] = React.useState("");
  const [postingComment, setPostingComment] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const canChangeStatus =
    canAssign || task.assigned_to_user_id === currentUserId || task.assigned_by_user_id === currentUserId;
  const canEdit = canAssign || task.assigned_by_user_id === currentUserId;

  React.useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase
      .from("task_comments")
      .select("id, author_user_id, body, created_at")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (active) setComments((data ?? []) as Comment[]);
      });
    return () => {
      active = false;
    };
  }, [task.id]);

  async function changeStatus(next: string) {
    setStatus(next);
    setSavingStatus(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_task_status", { p_task_id: task.id, p_status: next });
    setSavingStatus(false);
    if (error) {
      toast.push(error.message, "error");
      setStatus(task.status);
      return;
    }
    toast.push("Status updated", "success");
    router.refresh();
  }

  async function postComment() {
    if (postingComment || !newComment.trim()) return;
    setPostingComment(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_task_comment", { p_task_id: task.id, p_body: newComment.trim() });
    setPostingComment(false);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    // optimistic append
    setComments((c) => [
      ...c,
      { id: crypto.randomUUID(), author_user_id: currentUserId, body: newComment.trim(), created_at: new Date().toISOString() },
    ]);
    setNewComment("");
  }

  if (editing) {
    return (
      <TaskFormModal
        board={task.board}
        canAssign={canAssign}
        currentUserId={currentUserId}
        members={members}
        editing={task}
        onClose={() => {
          setEditing(false);
          onClose();
        }}
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={task.title}
      description={`${task.board === "marketing" ? "Marketing" : "Admin"} · assigned by ${nameOf(task.assigned_by_user_id)} · to ${nameOf(task.assigned_to_user_id)}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <Label htmlFor="d_status" className="mb-0">Status</Label>
          {canChangeStatus ? (
            <Select
              id="d_status"
              value={status}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={savingStatus}
              className="max-w-[200px]"
            >
              {STATUSES[task.board].map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          ) : (
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>
              {STATUS_LABEL[status] ?? status}
            </span>
          )}
        </div>

        {task.board === "admin" ? (
          <div className="grid grid-cols-2 gap-3 text-inkSoft">
            <div><span className="text-xs uppercase tracking-smallcaps">Priority</span><div className="text-ink capitalize">{task.priority ?? "—"}</div></div>
            <div><span className="text-xs uppercase tracking-smallcaps">Due</span><div className="text-ink">{task.due_date ? formatDate(task.due_date) : "—"}</div></div>
          </div>
        ) : (
          <div className="space-y-2">
            {task.work_link ? (
              <a href={task.work_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-berry hover:underline">
                <ExternalLink className="w-4 h-4" /> Open work link
              </a>
            ) : null}
            {task.post_date ? (
              <div className="text-inkSoft"><span className="text-xs uppercase tracking-smallcaps">Post date</span><div className="text-ink">{formatDate(task.post_date)}</div></div>
            ) : null}
            {task.proposed_caption ? (
              <div>
                <span className="text-xs uppercase tracking-smallcaps text-inkSoft">Proposed caption</span>
                <p className="text-ink whitespace-pre-wrap mt-0.5 rounded-md bg-cream/50 border border-border p-2">{task.proposed_caption}</p>
              </div>
            ) : null}
          </div>
        )}

        {task.description ? (
          <div>
            <span className="text-xs uppercase tracking-smallcaps text-inkSoft">{task.board === "marketing" ? "Notes" : "Description"}</span>
            <p className="text-ink whitespace-pre-wrap mt-0.5">{task.description}</p>
          </div>
        ) : null}

        {/* Comments */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
            <MessageSquare className="w-3.5 h-3.5" /> Comments / queries
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-inkSoft text-xs">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-md bg-cream/50 border border-border px-3 py-2">
                  <div className="text-[11px] text-inkSoft">
                    {nameOf(c.author_user_id)} · {formatDate(c.created_at)}
                  </div>
                  <div className="text-ink whitespace-pre-wrap">{c.body}</div>
                </div>
              ))
            )}
          </div>
          <div className="flex items-end gap-2 mt-2">
            <Textarea
              rows={1}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment or query…"
              disabled={postingComment}
            />
            <Button onClick={postComment} disabled={postingComment || !newComment.trim()}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
