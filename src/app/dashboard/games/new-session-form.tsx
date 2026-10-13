"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { SPORTS, type Sport } from "./logic";

export function NewSessionForm({ events }: { events: Array<{ id: string; name: string; event_date: string; start_time: string | null }> }) {
  const router = useRouter();
  const toast = useToast();
  const [eventId, setEventId] = React.useState(events[0]?.id ?? "");
  const [sport, setSport] = React.useState<Sport>("badminton");
  const [courts, setCourts] = React.useState("2");
  const [teamSize, setTeamSize] = React.useState("6");
  const [busy, setBusy] = React.useState(false);
  const fixed = SPORTS.find((s) => s.value === sport)?.teamSize ?? null;

  async function start() {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("game_sessions")
      .insert({
        event_id: eventId || null,
        sport,
        courts: Number(courts),
        team_size: fixed ?? Number(teamSize),
        created_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    router.push(`/dashboard/games/${data.id}`);
  }

  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <section className="bg-white border border-border rounded-lg shadow-card p-5">
      <h2 className="font-semibold text-ink">Start a session</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-4 items-end">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="gs_event">Event</Label>
          <Select id="gs_event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {fmt(e.event_date)}
              </option>
            ))}
            <option value="">No event (practice / one-off)</option>
          </Select>
          <p className="text-xs text-inkSoft">Picking the event lets you add checked-in pass holders with one tap.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gs_sport">Sport</Label>
          <Select id="gs_sport" value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
            {SPORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="gs_courts">Courts</Label>
            <Select id="gs_courts" value={courts} onChange={(e) => setCourts(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gs_size">A side</Label>
            {fixed ? (
              <div className="h-[38px] flex items-center text-sm text-inkSoft">{fixed} (doubles)</div>
            ) : (
              <Select id="gs_size" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                {[4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Button onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Start session"}
        </Button>
      </div>
    </section>
  );
}
