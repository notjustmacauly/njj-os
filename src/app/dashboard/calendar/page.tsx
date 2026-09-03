import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_ROLES, type Role } from "@/lib/roles";
import { CalendarClient, type CalEvent, type CalTaskItem } from "./calendar-client";

export const dynamic = "force-dynamic";

// PH-local YYYY-MM-DD for a timestamptz.
function phDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: { m?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = roleRow?.role as Role | null;
  if (!role || !TRACKER_ROLES.includes(role)) redirect("/dashboard");

  const now = new Date();
  const phNow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(now);
  const month = /^\d{4}-\d{2}$/.test(searchParams?.m ?? "") ? searchParams!.m! : phNow.slice(0, 7);
  const [yy, mm] = month.split("-").map(Number);

  // Broad window covering the visible grid (month ± ~1 week).
  const winStart = new Date(Date.UTC(yy, mm - 1, 1) - 8 * 3600e3 - 8 * 864e5).toISOString();
  const winEnd = new Date(Date.UTC(yy, mm, 1) - 8 * 3600e3 + 8 * 864e5).toISOString();

  const [{ data: events }, { data: tasks }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, title, event_type, starts_at, ends_at, all_day, location, notes, created_by_user_id")
      .is("deleted_at", null)
      .gte("starts_at", winStart)
      .lt("starts_at", winEnd)
      .order("starts_at"),
    supabase
      .from("tasks")
      .select("id, board, title, status, due_date, post_date")
      .is("deleted_at", null),
  ]);

  const calEvents: CalEvent[] = ((events ?? []) as CalEvent[]).map((e) => ({ ...e, date: phDate(e.starts_at) }));

  const taskItems: CalTaskItem[] = [];
  for (const t of (tasks ?? []) as Array<{ id: string; board: string; title: string; status: string; due_date: string | null; post_date: string | null }>) {
    if (t.board === "admin" && t.due_date) {
      taskItems.push({ id: t.id, date: t.due_date, title: t.title, kind: "due", status: t.status });
    }
    if (t.board === "marketing" && t.post_date) {
      taskItems.push({ id: t.id, date: t.post_date, title: t.title, kind: "post", status: t.status });
    }
  }

  const canManage = role === "owner" || role === "partner" || role === "manager";

  return (
    <CalendarClient
      month={month}
      events={calEvents}
      taskItems={taskItems}
      currentUserId={user.id}
      canManage={canManage}
    />
  );
}
