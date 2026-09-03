"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, LogIn, LogOut, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { MyChecklist, type ChecklistItem } from "./my-checklist";

export type MyTask = {
  id: string;
  board: "admin" | "marketing";
  title: string;
  status: string;
  due_date: string | null;
  post_date: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  approved: "Approved",
  revise: "Revise",
  scheduled: "Scheduled",
};

function getPosition(): Promise<{ lat: number; lng: number; acc: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}
function since(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function MyDayCard({
  openShift,
  tasks,
  checklist,
}: {
  openShift: { id: string; clock_in_at: string } | null;
  tasks: MyTask[];
  checklist: ChecklistItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function punch(kind: "in" | "out") {
    if (busy) return;
    setBusy(true);
    const pos = await getPosition();
    const supabase = createClient();
    const { error } = await supabase.rpc(kind === "in" ? "clock_in" : "clock_out", {
      p_lat: pos?.lat ?? null,
      p_lng: pos?.lng ?? null,
      p_accuracy: pos?.acc ?? null,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push(kind === "in" ? (pos ? "Timed in · location recorded" : "Timed in") : "Timed out", "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-3">
      {/* Clock-in */}
      <div className="bg-white border border-border rounded-lg shadow-card p-4 flex flex-col justify-between">
        <div>
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">Time-in</div>
          {openShift ? (
            <div className="mt-1 flex items-center gap-2 text-green">
              <span className="w-2 h-2 rounded-full bg-green inline-block" />
              <span className="font-semibold text-sm">Clocked in · {since(openShift.clock_in_at)}</span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-inkSoft">Not clocked in</div>
          )}
        </div>
        {openShift ? (
          <Button variant="dangerGhost" onClick={() => punch("out")} disabled={busy} className="mt-3 w-full">
            <LogOut className="w-4 h-4 mr-1.5" /> {busy ? "…" : "Time out"}
          </Button>
        ) : (
          <Button onClick={() => punch("in")} disabled={busy} className="mt-3 w-full">
            <LogIn className="w-4 h-4 mr-1.5" /> {busy ? "Getting location…" : "Time in"}
          </Button>
        )}
      </div>

      {/* My open tasks */}
      <div className="bg-white border border-border rounded-lg shadow-card p-4 md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">My open tasks</div>
          <Link href="/dashboard/tasks" className="text-xs font-semibold text-berry hover:underline inline-flex items-center gap-1">
            All tasks <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-inkSoft mt-2">Nothing assigned to you right now. 🎉</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {tasks.slice(0, 5).map((t) => {
              const date = t.board === "admin" ? t.due_date : t.post_date;
              const overdue = date ? date < new Date().toISOString().slice(0, 10) : false;
              return (
                <li key={t.id}>
                  <Link href="/dashboard/tasks" className="flex items-center justify-between gap-2 py-2 hover:text-berry">
                    <span className="truncate text-sm text-ink">{t.title}</span>
                    <span className="shrink-0 flex items-center gap-2 text-xs">
                      {date ? (
                        <span className={cn(overdue ? "text-coral font-semibold" : "text-inkSoft")}>
                          {overdue ? "overdue" : date.slice(5)}
                        </span>
                      ) : null}
                      <span className="text-inkSoft">{STATUS_LABEL[t.status] ?? t.status}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
    <MyChecklist initialItems={checklist} />
    </div>
  );
}
