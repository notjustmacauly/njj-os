"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type CalEvent = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  created_by_user_id: string;
  date: string; // YYYY-MM-DD (PH)
  attendees: string[];
};
export type CalTaskItem = { id: string; date: string; title: string; kind: "due" | "post"; status: string };
export type Member = { user_id: string; display_name: string };

const TYPE_TONE: Record<string, string> = {
  meeting: "bg-periBg text-peri",
  event: "bg-berryBg text-berry",
  marketing: "bg-salmonBg text-coral",
  holiday: "bg-greenBg text-green",
  deadline: "bg-yellowBg text-yellow",
  other: "bg-creamDk text-inkSoft",
  due: "bg-yellowBg text-yellow",
  post: "bg-salmonBg text-coral",
};
const TYPES = ["meeting", "event", "marketing", "holiday", "deadline", "other"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function shiftMonth(month: string, delta: number): string {
  let [y, m] = month.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}
function phToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

export function CalendarClient({
  month,
  events,
  taskItems,
  members,
  currentUserId,
  canManage,
}: {
  month: string;
  events: CalEvent[];
  taskItems: CalTaskItem[];
  members: Member[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [showNew, setShowNew] = React.useState<string | null>(null); // date preset
  const [openEvent, setOpenEvent] = React.useState<CalEvent | null>(null);

  const [y, m] = month.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = phToday();

  // 6-week grid, Sunday start.
  const first = new Date(y, m - 1, 1);
  const gridStart = new Date(y, m - 1, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, day: d.getDate(), inMonth: d.getMonth() === m - 1 };
  });

  const eventsByDate = new Map<string, CalEvent[]>();
  for (const e of events) {
    const list = eventsByDate.get(e.date) ?? [];
    list.push(e);
    eventsByDate.set(e.date, list);
  }
  const tasksByDate = new Map<string, CalTaskItem[]>();
  for (const t of taskItems) {
    const list = tasksByDate.get(t.date) ?? [];
    list.push(t);
    tasksByDate.set(t.date, list);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-serif font-bold text-3xl text-ink">{monthLabel}</h1>
          <div className="flex items-center gap-1">
            <Link href={`?m=${shiftMonth(month, -1)}`} className="p-1.5 rounded-md hover:bg-cream text-inkSoft">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <Link href={`?m=${shiftMonth(month, 1)}`} className="p-1.5 rounded-md hover:bg-cream text-inkSoft">
              <ChevronRight className="w-5 h-5" />
            </Link>
            <Link href={`?m=${phToday().slice(0, 7)}`} className="ml-1 text-xs font-semibold text-berry hover:underline">
              Today
            </Link>
          </div>
        </div>
        <Button onClick={() => setShowNew(today.slice(0, 7) === month ? today : `${month}-01`)}>
          <Plus className="w-4 h-4" />
          New event
        </Button>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <div className="grid grid-cols-7 bg-cream text-inkSoft text-xs font-semibold">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const dayEvents = eventsByDate.get(c.key) ?? [];
            const dayTasks = tasksByDate.get(c.key) ?? [];
            const isToday = c.key === today;
            return (
              <div
                key={c.key}
                className={cn(
                  "min-h-[92px] border-b border-r border-border p-1.5 align-top",
                  !c.inMonth && "bg-cream/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-semibold w-6 h-6 inline-flex items-center justify-center rounded-full",
                      isToday ? "bg-berry text-white" : c.inMonth ? "text-ink" : "text-inkSoft/50",
                    )}
                  >
                    {c.day}
                  </span>
                  {canManage || true ? (
                    <button
                      type="button"
                      onClick={() => setShowNew(c.key)}
                      className="opacity-0 hover:opacity-100 focus:opacity-100 text-inkSoft hover:text-berry transition"
                      aria-label="Add event"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-1 space-y-1">
                  {dayEvents.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setOpenEvent(e)}
                      className={cn(
                        "w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                        TYPE_TONE[e.event_type] ?? TYPE_TONE.other,
                      )}
                      title={e.title}
                    >
                      {!e.all_day ? `${timeLabel(e.starts_at)} · ` : ""}
                      {e.title}
                    </button>
                  ))}
                  {dayTasks.map((t) => (
                    <Link
                      key={t.id}
                      href="/dashboard/tasks"
                      className={cn(
                        "block truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                        TYPE_TONE[t.kind],
                      )}
                      title={`${t.kind === "post" ? "Post" : "Due"}: ${t.title}`}
                    >
                      {t.kind === "post" ? "📣 " : "⏰ "}
                      {t.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-inkSoft">
        {[["meeting", "Meeting"], ["event", "Event"], ["marketing", "Marketing"], ["holiday", "Holiday"], ["post", "Post date"], ["due", "Task due"]].map(([k, label]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("w-3 h-3 rounded", TYPE_TONE[k])} />
            {label}
          </span>
        ))}
      </div>

      {showNew ? (
        <EventFormModal presetDate={showNew} members={members} onClose={() => setShowNew(null)} onSaved={() => { setShowNew(null); router.refresh(); }} />
      ) : null}
      {openEvent ? (
        <EventDetailModal
          event={openEvent}
          members={members}
          canManage={canManage || openEvent.created_by_user_id === currentUserId}
          onClose={() => setOpenEvent(null)}
          onChanged={() => { setOpenEvent(null); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}

function EventFormModal({
  presetDate,
  editing,
  members,
  onClose,
  onSaved,
}: {
  presetDate?: string;
  editing?: CalEvent;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [type, setType] = React.useState(editing?.event_type ?? "meeting");
  const [date, setDate] = React.useState(editing?.date ?? presetDate ?? "");
  const [allDay, setAllDay] = React.useState(editing?.all_day ?? false);
  const [startTime, setStartTime] = React.useState(
    editing && !editing.all_day ? timeLabel(editing.starts_at).replace(/\s?[AP]M/i, "") : "09:00",
  );
  const [location, setLocation] = React.useState(editing?.location ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [attendees, setAttendees] = React.useState<string[]>(editing?.attendees ?? []);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggleAttendee = (id: string) =>
    setAttendees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function save() {
    if (saving) return;
    setError(null);
    if (!title.trim()) return setError("Title is required.");
    if (!date) return setError("Pick a date.");
    const startsAt = allDay ? `${date}T00:00:00+08:00` : `${date}T${(startTime || "09:00")}:00+08:00`;
    setSaving(true);
    const supabase = createClient();
    const args = {
      p_title: title.trim(),
      p_event_type: type,
      p_starts_at: startsAt,
      p_ends_at: null,
      p_all_day: allDay,
      p_location: location.trim() || null,
      p_notes: notes.trim() || null,
      p_attendee_ids: attendees,
    };
    const { error: err } = editing
      ? await supabase.rpc("update_calendar_event", { p_id: editing.id, ...args })
      : await supabase.rpc("create_calendar_event", args);
    setSaving(false);
    if (err) return setError(err.message);
    toast.push(editing ? "Event updated" : "Event added", "success");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={editing ? "Edit event" : "New event"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="ev_title" required>Title</Label>
          <Input id="ev_title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ev_type">Type</Label>
            <Select id="ev_type" value={type} onChange={(e) => setType(e.target.value)} disabled={saving}>
              {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev_date" required>Date</Label>
            <DateInput id="ev_date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={saving} />
            All day
          </label>
          {!allDay ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="ev_time" className="mb-0">Time</Label>
              <Input id="ev_time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={saving} className="w-32" />
            </div>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="ev_loc">Location</Label>
          <Input id="ev_loc" value={location} onChange={(e) => setLocation(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ev_notes">Notes</Label>
          <Textarea id="ev_notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
        </div>

        <div className="space-y-1">
          <Label>Attending / affected</Label>
          <p className="text-[11px] text-inkSoft">Tagged people get a notification.</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {members.length === 0 ? (
              <span className="text-xs text-inkSoft">No team members found.</span>
            ) : (
              members.map((m) => {
                const on = attendees.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleAttendee(m.user_id)}
                    disabled={saving}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition",
                      on ? "bg-berry text-white border-berry" : "bg-white text-ink border-border hover:bg-cream",
                    )}
                  >
                    {on ? "✓ " : ""}{m.display_name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {error ? <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">{error}</p> : null}
      </div>
    </Modal>
  );
}

function EventDetailModal({
  event,
  members,
  canManage,
  onClose,
  onChanged,
}: {
  event: CalEvent;
  members: Member[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const attendeeNames = event.attendees
    .map((id) => members.find((m) => m.user_id === id)?.display_name)
    .filter(Boolean)
    .join(", ");

  async function del() {
    if (deleting) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_calendar_event", { p_id: event.id });
    setDeleting(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Event deleted", "success");
    onChanged();
  }

  if (editing) {
    return <EventFormModal editing={event} members={members} onClose={() => setEditing(false)} onSaved={onChanged} />;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={event.title}
      description={`${event.event_type} · ${new Date(event.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" })}${event.all_day ? " · all day" : ` · ${timeLabel(event.starts_at)}`}`}
      size="sm"
      footer={
        canManage ? (
          <>
            <Button variant="dangerGhost" onClick={del} disabled={deleting}>{deleting ? "…" : "Delete"}</Button>
            <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-2 text-sm">
        {event.location ? (
          <div className="flex items-center gap-1.5 text-inkSoft"><MapPin className="w-4 h-4" /> {event.location}</div>
        ) : null}
        {attendeeNames ? (
          <div>
            <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">Attending / affected</span>
            <p className="text-ink">{attendeeNames}</p>
          </div>
        ) : null}
        {event.notes ? <p className="text-ink whitespace-pre-wrap">{event.notes}</p> : <p className="text-inkSoft text-xs">No notes.</p>}
      </div>
    </Modal>
  );
}
