"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, MapPin, LogIn, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type AttendanceRow = {
  id: string;
  user_id: string;
  clock_in_at: string;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy: number | null;
  clock_in_far: boolean | null;
  clock_out_at: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_accuracy: number | null;
};
export type Member = { user_id: string; display_name: string };
export type HoursRow = {
  user_id: string;
  display_name: string;
  shifts: number;
  total_minutes: number;
  open_shifts: number;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function duration(a: string, b: string | null): string {
  const end = b ? new Date(b).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - new Date(a).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

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

export function AttendanceClient({
  currentUserId,
  canSeeAll,
  rows,
  members,
  hours,
}: {
  currentUserId: string;
  canSeeAll: boolean;
  rows: AttendanceRow[];
  members: Member[];
  hours: HoursRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "—";
  const myRows = rows.filter((r) => r.user_id === currentUserId);
  const openShift = myRows.find((r) => !r.clock_out_at) ?? null;

  async function punch(kind: "in" | "out") {
    if (busy) return;
    setBusy(true);
    const pos = await getPosition();
    const supabase = createClient();
    const fn = kind === "in" ? "clock_in" : "clock_out";
    const { error } = await supabase.rpc(fn, {
      p_lat: pos?.lat ?? null,
      p_lng: pos?.lng ?? null,
      p_accuracy: pos?.acc ?? null,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    toast.push(
      kind === "in"
        ? pos
          ? "Timed in · location recorded"
          : "Timed in · no location (permission off)"
        : "Timed out",
      "success",
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-ink">Time-in</h1>
        <p className="text-sm text-inkSoft mt-1">Clock in when you start and out when you finish.</p>
      </div>

      {/* Clock in/out card */}
      <div className="bg-white border border-border rounded-lg shadow-card p-6 max-w-md">
        {openShift ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green">
              <span className="w-2.5 h-2.5 rounded-full bg-green inline-block" />
              <span className="font-semibold">Clocked in</span>
            </div>
            <div className="text-sm text-inkSoft flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Since {fmt(openShift.clock_in_at)} · {duration(openShift.clock_in_at, null)}
            </div>
            {openShift.clock_in_lat != null ? (
              <a
                href={`https://maps.google.com/?q=${openShift.clock_in_lat},${openShift.clock_in_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-berry hover:underline inline-flex items-center gap-1"
              >
                <MapPin className="w-3.5 h-3.5" /> Location recorded
                {openShift.clock_in_accuracy ? ` (±${Math.round(openShift.clock_in_accuracy)}m)` : ""}
              </a>
            ) : (
              <div className="text-xs text-inkSoft">No location recorded</div>
            )}
            <Button variant="dangerGhost" onClick={() => punch("out")} disabled={busy}>
              <LogOut className="w-4 h-4 mr-1.5" />
              {busy ? "…" : "Time out"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-inkSoft">
              <span className="w-2.5 h-2.5 rounded-full bg-inkSoft/40 inline-block" />
              <span className="font-semibold text-ink">Not clocked in</span>
            </div>
            <p className="text-xs text-inkSoft">
              Your browser will ask to share your location so we can record where you timed in.
            </p>
            <Button onClick={() => punch("in")} disabled={busy}>
              <LogIn className="w-4 h-4 mr-1.5" />
              {busy ? "Getting location…" : "Time in"}
            </Button>
          </div>
        )}
      </div>

      {/* My recent */}
      <div>
        <h2 className="font-serif font-bold text-lg text-ink mb-2">My recent shifts</h2>
        <AttendanceTable rows={myRows.slice(0, 20)} showName={false} nameOf={nameOf} />
      </div>

      {/* Hours this month + Team (owner/partner/manager) */}
      {canSeeAll ? (
        <>
          <div>
            <h2 className="font-serif font-bold text-lg text-ink mb-2">Hours this month</h2>
            {hours.length === 0 ? (
              <div className="bg-white border border-border rounded-lg shadow-card p-6 text-center text-sm text-inkSoft">
                No shifts logged this month yet.
              </div>
            ) : (
              <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-cream text-inkSoft">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2">Who</th>
                      <th className="text-right font-semibold px-4 py-2">Shifts</th>
                      <th className="text-right font-semibold px-4 py-2">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hours.map((h) => (
                      <tr key={h.user_id}>
                        <td className="px-4 py-2 font-medium text-ink">{h.display_name}</td>
                        <td className="px-4 py-2 text-right text-inkSoft">
                          {h.shifts}
                          {h.open_shifts > 0 ? <span className="text-green"> · {h.open_shifts} open</span> : null}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-ink">
                          {Math.floor(h.total_minutes / 60)}h {h.total_minutes % 60}m
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-serif font-bold text-lg text-ink mb-2">Team shifts</h2>
            <AttendanceTable
              rows={rows.filter((r) => r.user_id !== currentUserId).slice(0, 100)}
              showName
              nameOf={nameOf}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function AttendanceTable({
  rows,
  showName,
  nameOf,
}: {
  rows: AttendanceRow[];
  showName: boolean;
  nameOf: (id: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-card p-6 text-center text-sm text-inkSoft">
        No shifts yet.
      </div>
    );
  }
  return (
    <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cream text-inkSoft">
          <tr>
            {showName ? <th className="text-left font-semibold px-4 py-2">Who</th> : null}
            <th className="text-left font-semibold px-4 py-2">Time in</th>
            <th className="text-left font-semibold px-4 py-2">Time out</th>
            <th className="text-left font-semibold px-4 py-2">Duration</th>
            <th className="text-left font-semibold px-4 py-2">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              {showName ? <td className="px-4 py-2 font-medium text-ink">{nameOf(r.user_id)}</td> : null}
              <td className="px-4 py-2 text-ink">{fmt(r.clock_in_at)}</td>
              <td className="px-4 py-2 text-inkSoft">
                {r.clock_out_at ? fmt(r.clock_out_at) : <span className="text-green font-semibold">Open</span>}
              </td>
              <td className="px-4 py-2 text-inkSoft">{duration(r.clock_in_at, r.clock_out_at)}</td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  {r.clock_in_lat != null ? (
                    <a
                      href={`https://maps.google.com/?q=${r.clock_in_lat},${r.clock_in_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-berry hover:underline inline-flex items-center gap-1"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Map
                    </a>
                  ) : (
                    <span className="text-inkSoft/60 text-xs">—</span>
                  )}
                  {r.clock_in_far ? (
                    <span
                      className="inline-flex items-center rounded-full bg-salmonBg text-coral px-2 py-0.5 text-[11px] font-semibold"
                      title="Clocked in away from a known work site"
                    >
                      ⚠ Far
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
