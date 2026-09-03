"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { Member, TaskTemplate } from "./tasks-client";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecurringModal({
  templates,
  members,
  onClose,
}: {
  templates: TaskTemplate[];
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.user_id === id)?.display_name ?? "—" : "Unassigned";

  const [board, setBoard] = React.useState<"admin" | "marketing">("admin");
  const [title, setTitle] = React.useState("");
  const [assignedTo, setAssignedTo] = React.useState("");
  const [cadence, setCadence] = React.useState<"daily" | "weekly" | "monthly">("weekly");
  const [weekday, setWeekday] = React.useState(1);
  const [dayOfMonth, setDayOfMonth] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function add() {
    if (busy) return;
    setError(null);
    if (!title.trim()) return setError("Title is required.");
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("save_task_template", {
      p_id: null,
      p_board: board,
      p_title: title.trim(),
      p_cadence: cadence,
      p_assigned_to: assignedTo || null,
      p_weekday: cadence === "weekly" ? weekday : null,
      p_day_of_month: cadence === "monthly" ? dayOfMonth : null,
      p_lead_days: 0,
      p_active: true,
    });
    setBusy(false);
    if (err) return setError(err.message);
    toast.push("Recurring task added", "success");
    setTitle("");
    router.refresh();
  }

  async function del(id: string) {
    const supabase = createClient();
    const { error: err } = await supabase.rpc("delete_task_template", { p_id: id });
    if (err) return toast.push(err.message, "error");
    toast.push("Removed", "success");
    router.refresh();
  }

  function cadenceLabel(t: TaskTemplate): string {
    if (t.cadence === "daily") return "Every day";
    if (t.cadence === "weekly") return `Every ${WEEKDAYS[t.weekday ?? 1]}`;
    return `Monthly on day ${t.day_of_month ?? 1}`;
  }

  return (
    <Modal open onClose={onClose} title="Recurring tasks" size="md" footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <p className="text-xs text-inkSoft">
          These auto-create a task on their schedule (checked every morning). Great for weekly posts or routine admin.
        </p>

        {/* Existing */}
        {templates.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {t.title} <span className="text-xs text-inkSoft capitalize">· {t.board}</span>
                  </div>
                  <div className="text-xs text-inkSoft">
                    {cadenceLabel(t)} · {nameOf(t.assigned_to_user_id)}
                  </div>
                </div>
                <button type="button" onClick={() => del(t.id)} className="text-inkSoft hover:text-coral p-1" aria-label="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-inkSoft">No recurring tasks yet.</p>
        )}

        {/* Add */}
        <div className="rounded-lg border border-border bg-cream/30 p-3 space-y-3">
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">Add recurring task</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rt_board">Board</Label>
              <Select id="rt_board" value={board} onChange={(e) => setBoard(e.target.value as "admin" | "marketing")} disabled={busy}>
                <option value="admin">Admin</option>
                <option value="marketing">Marketing</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rt_assignee">Assign to</Label>
              <Select id="rt_assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={busy}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rt_title" required>Task</Label>
            <Input id="rt_title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rt_cadence">Repeats</Label>
              <Select id="rt_cadence" value={cadence} onChange={(e) => setCadence(e.target.value as "daily" | "weekly" | "monthly")} disabled={busy}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
            {cadence === "weekly" ? (
              <div className="space-y-1">
                <Label htmlFor="rt_weekday">On</Label>
                <Select id="rt_weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} disabled={busy}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </Select>
              </div>
            ) : cadence === "monthly" ? (
              <div className="space-y-1">
                <Label htmlFor="rt_dom">Day (1–28)</Label>
                <Input id="rt_dom" type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} disabled={busy} />
              </div>
            ) : <div />}
          </div>
          {error ? <p className="text-sm text-coral">{error}</p> : null}
          <Button onClick={add} disabled={busy}>{busy ? "Adding…" : "Add"}</Button>
        </div>
      </div>
    </Modal>
  );
}
