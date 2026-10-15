"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { FORMATS, seasonName, seasonOf, SPORTS, suggestedFormat, type Format, type Sport } from "./logic";

type EventOpt = { id: string; name: string; event_date: string; start_time: string | null };

export function NewSessionForm({ events }: { events: EventOpt[] }) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const [eventId, setEventId] = React.useState(events[0]?.id ?? "");
  const [sport, setSport] = React.useState<Sport>("badminton");
  const [courts, setCourts] = React.useState("3");
  const [teamSize, setTeamSize] = React.useState("6");
  const [ranked, setRanked] = React.useState(true);
  const date = events.find((e) => e.id === eventId)?.event_date ?? today;
  const suggested = suggestedFormat(date);
  const [format, setFormat] = React.useState<Format>(suggested && suggested !== "rivalry" ? suggested : "classic");
  const [busy, setBusy] = React.useState(false);
  const fixed = SPORTS.find((s) => s.value === sport)?.teamSize ?? null;
  const canRank = fixed === 2;
  const isRanked = ranked && canRank;
  const season = seasonOf(date);

  React.useEffect(() => {
    const s = suggestedFormat(date);
    if (s && s !== "rivalry") setFormat(s);
  }, [date]);

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
        ruleset: isRanked ? "rally_rank" : "casual",
        format: isRanked ? format : null,
        session_date: date,
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

      <div className={cn("mt-4 rounded-lg border p-4", isRanked ? "border-berryLt bg-berryBg/40" : "border-border")}>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={isRanked}
            disabled={!canRank}
            onChange={(e) => setRanked(e.target.checked)}
            className="w-4 h-4 accent-berry"
          />
          Rally &amp; Rank (ranked: League Points, ratings, season leaderboard)
        </label>
        {!canRank ? <p className="mt-1 text-xs text-inkSoft">Rally &amp; Rank is doubles only. This session will be casual.</p> : null}
        {isRanked ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  disabled={!f.ready}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-left ring-1 transition disabled:opacity-40",
                    format === f.value ? "bg-white ring-berry" : "bg-white/60 ring-border hover:ring-berryLt",
                  )}
                >
                  <div className="text-sm font-semibold text-ink">
                    {f.label}
                    {suggested === f.value ? <span className="ml-1.5 text-[10px] font-bold uppercase text-berry">this week</span> : null}
                  </div>
                  <div className="text-xs text-inkSoft">{f.blurb}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-inkSoft">
              {season ? `Counts toward ${seasonName(season)} once finalized.` : "Before 1 Nov 2026: a practice event, it won't count toward any season."}
            </p>
          </>
        ) : null}
      </div>

      <div className="mt-4">
        <Button onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Start session"}
        </Button>
      </div>
    </section>
  );
}
