"use client";

import * as React from "react";
import { Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type ChecklistItem = {
  id: string;
  title: string;
  cadence: "once" | "daily" | "weekly";
  weekday: number | null;
  completed_at: string | null;
  last_done_on: string | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function phToday(): { date: string; dow: number } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const wk = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short" }).format(new Date());
  return { date, dow: WEEKDAYS.indexOf(wk) };
}

export function MyChecklist({ initialItems }: { initialItems: ChecklistItem[] }) {
  const toast = useToast();
  const [items, setItems] = React.useState<ChecklistItem[]>(initialItems);
  const [title, setTitle] = React.useState("");
  const [cadence, setCadence] = React.useState<"once" | "daily" | "weekly">("daily");
  const [weekday, setWeekday] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const [showDone, setShowDone] = React.useState(false);
  const { date: today, dow } = React.useMemo(phToday, []);

  const isDone = (i: ChecklistItem) =>
    i.cadence === "once" ? !!i.completed_at : i.last_done_on === today;
  // Today's list: recurring items always show (they reset each day); one-offs
  // show until ticked, then drop into the collapsible "Done" section below so
  // finished one-offs don't pile up.
  const todaysItems = items.filter((i) => (i.cadence === "weekly" ? i.weekday === dow : true));
  const active = todaysItems.filter((i) => !(i.cadence === "once" && i.completed_at));
  const doneOnce = items.filter((i) => i.cadence === "once" && i.completed_at);

  async function toggle(i: ChecklistItem) {
    // optimistic
    setItems((prev) =>
      prev.map((x) => {
        if (x.id !== i.id) return x;
        if (x.cadence === "once") return { ...x, completed_at: x.completed_at ? null : new Date().toISOString() };
        return { ...x, last_done_on: x.last_done_on === today ? null : today };
      }),
    );
    const supabase = createClient();
    const { error } = await supabase.rpc("toggle_checklist_item", { p_id: i.id });
    if (error) toast.push(error.message, "error");
  }

  async function add() {
    if (adding || !title.trim()) return;
    setAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("add_checklist_item", {
      p_title: title.trim(),
      p_cadence: cadence,
      p_weekday: cadence === "weekly" ? weekday : null,
    });
    setAdding(false);
    if (error) return toast.push(error.message, "error");
    setItems((prev) => [
      ...prev,
      { id: String(data), title: title.trim(), cadence, weekday: cadence === "weekly" ? weekday : null, completed_at: null, last_done_on: null },
    ]);
    setTitle("");
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_checklist_item", { p_id: id });
    if (error) toast.push(error.message, "error");
  }

  function label(i: ChecklistItem): string {
    if (i.cadence === "once") return "one-off";
    if (i.cadence === "daily") return "daily";
    return `every ${WEEKDAYS[i.weekday ?? 1]}`;
  }

  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-4">
      <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">My daily checklist</div>

      <ul className="mt-2 divide-y divide-border">
        {active.length === 0 ? (
          <li className="py-2 text-sm text-inkSoft">Nothing for today — add your routines below.</li>
        ) : (
          active.map((i) => {
            const done = isDone(i);
            return (
              <li key={i.id} className="flex items-center gap-2 py-2 group">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition",
                    done ? "bg-green border-green text-white" : "border-border hover:border-green",
                  )}
                  aria-label={done ? "Mark not done" : "Mark done"}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : null}
                </button>
                <span className={cn("flex-1 text-sm", done ? "text-inkSoft line-through" : "text-ink")}>{i.title}</span>
                <span className="text-[10px] uppercase tracking-smallcaps text-inkSoft/70">{label(i)}</span>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="opacity-0 group-hover:opacity-100 text-inkSoft hover:text-coral transition"
                  aria-label="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      {/* Done — ticked one-offs, tucked away so they don't clog the list. */}
      {doneOnce.length > 0 ? (
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-inkSoft hover:text-ink"
          >
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", showDone && "rotate-90")} />
            Done · {doneOnce.length}
          </button>
          {showDone ? (
            <ul className="mt-1 divide-y divide-border">
              {doneOnce.map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-2 group">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="w-5 h-5 rounded-md border border-green bg-green text-white flex items-center justify-center shrink-0"
                    aria-label="Mark not done"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1 text-sm text-inkSoft line-through">{i.title}</span>
                  <button
                    type="button"
                    onClick={() => remove(i.id)}
                    className="opacity-0 group-hover:opacity-100 text-inkSoft hover:text-coral transition"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Add */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a routine…"
          className="flex-1 min-w-[140px] rounded-md border border-border px-2.5 py-1.5 text-sm outline-none focus:border-berry"
        />
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as "once" | "daily" | "weekly")}
          className="rounded-md border border-border px-2 py-1.5 text-sm bg-white"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="once">One-off</option>
        </select>
        {cadence === "weekly" ? (
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="rounded-md border border-border px-2 py-1.5 text-sm bg-white"
          >
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        ) : null}
        <button
          type="button"
          onClick={add}
          disabled={adding || !title.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-berry text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </div>
  );
}
