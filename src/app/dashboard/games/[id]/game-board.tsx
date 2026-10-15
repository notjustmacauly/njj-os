"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coffee, Play, Plus, Search, Shuffle, Trophy, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  balanceOf,
  minutesSince,
  nextUp,
  partnerCounts,
  rankedSplits,
  ratingDeltas,
  SKILL_RATING,
  SPORTS,
  teamAverage,
  type Skill,
} from "../logic";
import { CourtArt } from "./court-art";
import { PlayerToken, shortName, TIER_STYLE } from "./player-token";

type Player = { id: string; display_name: string; email: string | null; rating: number; skill_level: Skill };
type Match = {
  id: string;
  court: number;
  team_a: string[];
  team_b: string[];
  score_a: number | null;
  score_b: number | null;
  winner: "a" | "b" | null;
  status: "queued" | "playing" | "done";
  started_at: string;
  finished_at: string | null;
};
type RosterRow = { player_id: string; active: boolean; waiting_since: string; joined_at: string; game_players: Player };
export type BoardData = {
  session: {
    id: string;
    sport: string;
    session_date: string;
    courts: number;
    team_size: number;
    status: "open" | "closed";
    event_id: string | null;
    events: { name: string } | null;
  };
  roster: RosterRow[];
  matches: Match[];
  master: Player[];
  passes: Array<{ id: string; holder_name: string | null; buyer_email: string | null; ticket_type_name: string; checked_in_at: string }>;
};

// Where a player sits: a slot in a game (playing or queued) or the general queue.
type Loc = { kind: "match"; matchId: string; team: "a" | "b"; idx: number } | { kind: "queue"; playerId: string };
const enc = (l: Loc) => (l.kind === "match" ? `m:${l.matchId}:${l.team}:${l.idx}` : `q:${l.playerId}`);
const dec = (s: string): Loc | null => {
  const p = s.split(":");
  if (p[0] === "m" && p.length === 4) return { kind: "match", matchId: p[1], team: p[2] as "a" | "b", idx: Number(p[3]) };
  if (p[0] === "q" && p.length === 2) return { kind: "queue", playerId: p[1] };
  return null;
};

const fmtMins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);

const BALANCE_STYLE = {
  Fair: "bg-greenBg text-green",
  Close: "bg-yellowBg text-[#854F0B]",
  Uneven: "bg-salmonBg text-coral",
} as const;

export function GameBoard({ data }: { data: BoardData }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = data;
  const sport = SPORTS.find((s) => s.value === session.sport);
  const open = session.status === "open";
  const need = session.team_size * 2;
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Loc | null>(null);
  const [shuffleIdx, setShuffleIdx] = React.useState<Record<string, number>>({});
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const byId = React.useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of data.master) m.set(p.id, p);
    for (const r of data.roster) m.set(r.player_id, r.game_players);
    return m;
  }, [data]);
  const rating = (id: string) => Number(byId.get(id)?.rating ?? 3.5);
  const nameOf = (id: string) => byId.get(id)?.display_name ?? "Unknown";
  const P = (id: string) => ({ id, rating: rating(id), waiting_since: "" });

  const playing = data.matches.filter((m) => m.status === "playing");
  const queued = data.matches.filter((m) => m.status === "queued");
  const done = data.matches.filter((m) => m.status === "done");
  const inLineup = new Set([...playing, ...queued].flatMap((m) => [...m.team_a, ...m.team_b]));
  const onCourt = new Set(playing.flatMap((m) => [...m.team_a, ...m.team_b]));
  const general = data.roster
    .filter((r) => r.active && !inLineup.has(r.player_id))
    .sort((a, b) => a.waiting_since.localeCompare(b.waiting_since));
  const benched = data.roster.filter((r) => !r.active);
  const gamesTonight = (id: string) => done.filter((m) => m.team_a.includes(id) || m.team_b.includes(id)).length;

  // ---------------------------------------------------------------- actions
  async function run(fn: () => Promise<void>, ok?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refill();
      if (ok) toast.push(ok, "success");
    } catch (e) {
      toast.push((e as Error).message, "error");
    } finally {
      setSelected(null);
      setBusy(false);
      router.refresh();
    }
  }

  /** Give every court without a "next" lineup one from the general queue. */
  async function refill() {
    if (!open) return;
    const supabase = createClient();
    const [{ data: ms }, { data: rs }] = await Promise.all([
      supabase.from("game_matches").select("id, court, team_a, team_b, status").eq("session_id", session.id).in("status", ["queued", "playing", "done"]),
      supabase.from("game_session_players").select("player_id, active, waiting_since").eq("session_id", session.id),
    ]);
    const matches = (ms ?? []) as Array<{ court: number; team_a: string[]; team_b: string[]; status: string }>;
    const taken = new Set(matches.filter((m) => m.status !== "done").flatMap((m) => [...m.team_a, ...m.team_b]));
    const history = matches.filter((m) => m.status === "done");
    let pool = ((rs ?? []) as Array<{ player_id: string; active: boolean; waiting_since: string }>)
      .filter((r) => r.active && !taken.has(r.player_id))
      .map((r) => ({ id: r.player_id, rating: rating(r.player_id), waiting_since: r.waiting_since }));
    for (let court = 1; court <= session.courts; court++) {
      if (matches.some((m) => m.court === court && m.status === "queued")) continue;
      const players = nextUp(pool, session.team_size);
      if (!players) break;
      const [a, b] = rankedSplits(players, partnerCounts(history))[0];
      const { error } = await supabase
        .from("game_matches")
        .insert({ session_id: session.id, court, status: "queued", team_a: a.map((p) => p.id), team_b: b.map((p) => p.id) });
      if (error && error.code !== "23505") throw new Error(error.message);
      const used = new Set(players.map((p) => p.id));
      pool = pool.filter((p) => !used.has(p.id));
    }
  }

  async function startQueued(m: Match) {
    const { error } = await createClient()
      .from("game_matches")
      .update({ status: "playing", started_at: new Date().toISOString() })
      .eq("id", m.id)
      .eq("status", "queued");
    if (error) throw new Error(error.code === "23505" ? `Court ${m.court} already has a game on.` : error.message);
  }

  async function win(m: Match, side: "a" | "b") {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("game_matches")
      .update({ winner: side, status: "done", finished_at: now })
      .eq("id", m.id)
      .eq("status", "playing");
    if (error) throw new Error(error.message);
    const ids = [...m.team_a, ...m.team_b];
    await supabase.from("game_session_players").update({ waiting_since: now }).eq("session_id", session.id).in("player_id", ids);
    for (const r of ratingDeltas(m.team_a.map(P), m.team_b.map(P), side === "a")) {
      await supabase.from("game_players").update({ rating: r.rating, updated_at: now }).eq("id", r.id);
    }
    // The court's next four walk straight on.
    const next = queued.find((q) => q.court === m.court);
    if (next) await startQueued(next);
  }

  async function cancelGame(m: Match) {
    const { error } = await createClient().from("game_matches").update({ status: "void", finished_at: new Date().toISOString() }).eq("id", m.id);
    if (error) throw new Error(error.message);
  }

  async function reshuffle(m: Match) {
    const players = [...m.team_a, ...m.team_b].map((id) => ({ id, rating: rating(id), waiting_since: "" }));
    const splits = rankedSplits(players, partnerCounts(done));
    const i = ((shuffleIdx[m.id] ?? 0) + 1) % splits.length;
    setShuffleIdx((s) => ({ ...s, [m.id]: i }));
    const [a, b] = splits[i];
    const { error } = await createClient()
      .from("game_matches")
      .update({ team_a: a.map((p) => p.id), team_b: b.map((p) => p.id) })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
  }

  function idAt(l: Loc): string | null {
    if (l.kind === "queue") return l.playerId;
    const m = data.matches.find((x) => x.id === l.matchId);
    return m ? (l.team === "a" ? m.team_a : m.team_b)[l.idx] ?? null : null;
  }

  async function swap(a: Loc, b: Loc) {
    const ia = idAt(a);
    const ib = idAt(b);
    if (!ia || !ib || ia === ib) return;
    const supabase = createClient();
    if (a.kind === "queue" && b.kind === "queue") {
      // Swap queue positions.
      const ra = data.roster.find((r) => r.player_id === ia)!;
      const rb = data.roster.find((r) => r.player_id === ib)!;
      await supabase.from("game_session_players").update({ waiting_since: rb.waiting_since }).eq("session_id", session.id).eq("player_id", ia);
      await supabase.from("game_session_players").update({ waiting_since: ra.waiting_since }).eq("session_id", session.id).eq("player_id", ib);
      return;
    }
    // Rewrite each game row involved; queue players keep their place in line.
    const rows = new Map<string, { team_a: string[]; team_b: string[] }>();
    const rowFor = (id: string) => {
      if (!rows.has(id)) {
        const m = data.matches.find((x) => x.id === id)!;
        rows.set(id, { team_a: [...m.team_a], team_b: [...m.team_b] });
      }
      return rows.get(id)!;
    };
    const put = (l: Loc, v: string) => {
      if (l.kind !== "match") return;
      const r = rowFor(l.matchId);
      (l.team === "a" ? r.team_a : r.team_b)[l.idx] = v;
    };
    put(a, ib);
    put(b, ia);
    for (const [id, r] of Array.from(rows)) {
      const { error } = await supabase.from("game_matches").update(r).eq("id", id);
      if (error) throw new Error(error.message);
    }
  }

  function pick(l: Loc) {
    if (!open || busy) return;
    if (!selected) return setSelected(l);
    if (enc(selected) === enc(l)) return setSelected(null);
    const from = selected;
    run(() => swap(from, l), "Swapped");
  }

  async function takeBreak(playerId: string) {
    const supabase = createClient();
    if (onCourt.has(playerId)) throw new Error("They're mid-game. Finish the game first.");
    const q = queued.find((m) => m.team_a.includes(playerId) || m.team_b.includes(playerId));
    if (q) await supabase.from("game_matches").delete().eq("id", q.id).eq("status", "queued");
    const { error } = await supabase.from("game_session_players").update({ active: false }).eq("session_id", session.id).eq("player_id", playerId);
    if (error) throw new Error(error.message);
  }

  async function backIn(playerId: string) {
    const { error } = await createClient()
      .from("game_session_players")
      .update({ active: true, waiting_since: new Date().toISOString() })
      .eq("session_id", session.id)
      .eq("player_id", playerId);
    if (error) throw new Error(error.message);
  }

  async function addToSession(playerId: string) {
    const { error } = await createClient()
      .from("game_session_players")
      .upsert({ session_id: session.id, player_id: playerId, active: true, waiting_since: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async function addNewPlayer(displayName: string, email: string, skill: Skill) {
    const clean = email.trim().toLowerCase() || null;
    if (clean) {
      const existing = data.master.find((p) => (p.email ?? "").toLowerCase() === clean);
      if (existing) return addToSession(existing.id);
    }
    const { data: row, error } = await createClient()
      .from("game_players")
      .insert({ display_name: displayName.trim(), email: clean, skill_level: skill, rating: SKILL_RATING[skill] })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23505" ? "A player with that email already exists. Search for them instead." : error.message);
    await addToSession(row.id);
  }

  async function closeSession() {
    const supabase = createClient();
    await supabase.from("game_matches").delete().eq("session_id", session.id).eq("status", "queued");
    const { error } = await supabase.from("game_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", session.id);
    if (error) throw new Error(error.message);
  }

  // Tonight's mini standings (same rule as the leaderboard).
  const tonight = data.roster
    .map((r) => {
      const games = done.filter((m) => m.team_a.includes(r.player_id) || m.team_b.includes(r.player_id));
      const wins = games.filter((m) => (m.winner === "a" ? m.team_a : m.team_b).includes(r.player_id)).length;
      return { id: r.player_id, wins, games: games.length, pts: games.length ? wins * 3 + (games.length - wins) + 2 : 0 };
    })
    .filter((x) => x.games > 0)
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins);

  const selectedId = selected ? idAt(selected) : null;
  const isSel = (l: Loc) => !!selected && enc(selected) === enc(l);
  const tokenProps = (l: Loc, id: string, onCourtStyle: boolean) => ({
    name: nameOf(id),
    rating: rating(id),
    selected: isSel(l),
    onCourt: onCourtStyle,
    dragData: open ? enc(l) : undefined,
    onSelect: () => pick(l),
    onDropData: open
      ? (from: string) => {
          const f = dec(from);
          if (f) run(() => swap(f, l), "Swapped");
        }
      : undefined,
    disabled: !open || busy,
  });

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/games" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Sessions
        </Link>
        <h1 className="font-serif font-bold text-2xl text-ink">
          {sport?.label ?? session.sport}
          {session.events?.name ? <span className="font-sans font-normal text-base text-inkSoft"> · {session.events.name}</span> : null}
        </h1>
        <span className="rounded-full bg-cream ring-1 ring-border px-2.5 py-0.5 text-xs text-inkSoft">
          {session.team_size} a side · Win 3 · Loss 1 · +2 for playing
        </span>
        <div className="ml-auto">
          {open ? (
            <Button variant="ghost" onClick={() => run(closeSession, "Session closed")} disabled={busy || playing.length > 0} title={playing.length ? "Finish games on court first" : ""}>
              Close session
            </Button>
          ) : (
            <span className="text-xs font-semibold rounded-full bg-cream text-inkSoft px-2 py-0.5">Closed</span>
          )}
        </div>
      </div>

      {/* Selection bar */}
      {selectedId ? (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-ink text-white px-4 py-2.5 shadow-lg">
          <span className="text-sm">
            <span className="font-semibold">{shortName(nameOf(selectedId))}</span> selected. Tap another player to swap.
          </span>
          <div className="ml-auto flex gap-2">
            {!onCourt.has(selectedId) ? (
              <button
                type="button"
                onClick={() => run(() => takeBreak(selectedId), `${shortName(nameOf(selectedId))} is on a break`)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
              >
                <Coffee className="w-3.5 h-3.5" /> Take a break
              </button>
            ) : null}
            <button type="button" onClick={() => setSelected(null)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-5",
          // Three courts need room: the side panel moves beside them only on wide screens.
          session.courts >= 3 ? "2xl:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        {/* Courts */}
        <div className={cn("grid gap-4 content-start sm:grid-cols-2", session.courts >= 3 ? "lg:grid-cols-3" : "")}>
          {Array.from({ length: session.courts }, (_, i) => i + 1).map((court) => {
            const live = playing.find((m) => m.court === court);
            const next = queued.find((m) => m.court === court);
            const shown = live ?? next;
            const waitingFor = Math.max(0, need - general.length);
            return (
              <section key={court} className="min-w-0 rounded-3xl bg-white ring-1 ring-border shadow-card p-3">
                <div className="flex items-center justify-between px-1.5 pb-2">
                  <span className="font-serif font-bold text-lg text-ink">Court {court}</span>
                  {live ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-greenBg text-green px-2.5 py-0.5 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse motion-reduce:animate-none" /> Playing · {fmtMins(minutesSince(live.started_at))}
                    </span>
                  ) : (
                    <span className="rounded-full bg-cream text-inkSoft px-2.5 py-0.5 text-xs font-semibold">Free</span>
                  )}
                </div>

                {/* The court */}
                <div className="relative mx-auto aspect-[3/4] w-full max-w-[400px] overflow-hidden rounded-2xl">
                  <CourtArt sport={session.sport} />
                  {shown ? (
                    <div className={cn("absolute inset-0 grid grid-rows-2", !live && "bg-white/25")}>
                      {(["a", "b"] as const).map((team) => {
                        const ids = team === "a" ? shown.team_a : shown.team_b;
                        return (
                          <div
                            key={team}
                            className={cn("relative flex items-center justify-center gap-3 px-2 py-4", team === "a" ? "flex-col" : "flex-col-reverse")}
                          >
                            <div className="flex flex-wrap justify-center gap-x-1.5 gap-y-3">
                              {ids.map((id, idx) => (
                                <PlayerToken
                                  key={id}
                                  size={ids.length > 2 ? "sm" : "md"}
                                  {...tokenProps({ kind: "match", matchId: shown.id, team, idx }, id, true)}
                                />
                              ))}
                            </div>
                            {live && open ? (
                              <button
                                type="button"
                                onClick={() => run(() => win(live, team), `Court ${court}: ${team === "a" ? "top" : "bottom"} team won`)}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-1.5 text-sm font-bold text-ink shadow-md transition hover:scale-105 active:scale-95"
                              >
                                <Trophy className="w-4 h-4 text-[#BA7517]" /> Won
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {!live ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none [&>*]:pointer-events-auto">
                          {open ? (
                            <button
                              type="button"
                              onClick={() => run(() => startQueued(shown), `Game on court ${court}`)}
                              disabled={busy}
                              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105 active:scale-95"
                            >
                              <Play className="w-4 h-4" /> Start game
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-ink shadow">
                        {open ? `Waiting for ${waitingFor || need} more player${(waitingFor || need) === 1 ? "" : "s"}` : "Court free"}
                      </span>
                    </div>
                  )}
                </div>

                {shown ? <BalanceRow a={shown.team_a.map(P)} b={shown.team_b.map(P)} label={live ? "On court" : "Up next"} /> : null}

                {/* Next on this court (only while a game is on) */}
                {live ? (
                  <div className="mt-2 rounded-2xl bg-cream/70 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-smallcaps text-inkSoft">Next on court {court}</span>
                      {next && open ? (
                        <button
                          type="button"
                          onClick={() => run(() => reshuffle(next))}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-inkSoft hover:text-ink"
                        >
                          <Shuffle className="w-3.5 h-3.5" /> Reshuffle
                        </button>
                      ) : null}
                    </div>
                    {next ? (
                      <>
                        <div className="mt-1.5 flex flex-col items-center gap-0.5">
                          <div className="flex flex-wrap justify-center gap-1">
                            {next.team_a.map((id, idx) => (
                              <PlayerToken key={id} size="sm" {...tokenProps({ kind: "match", matchId: next.id, team: "a", idx }, id, false)} />
                            ))}
                          </div>
                          <span className="text-[10px] font-bold uppercase text-inkSoft">vs</span>
                          <div className="flex flex-wrap justify-center gap-1">
                            {next.team_b.map((id, idx) => (
                              <PlayerToken key={id} size="sm" {...tokenProps({ kind: "match", matchId: next.id, team: "b", idx }, id, false)} />
                            ))}
                          </div>
                        </div>
                        <BalanceRow a={next.team_a.map(P)} b={next.team_b.map(P)} compact />
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-inkSoft">
                        {open ? `Waiting for ${waitingFor || need} more in the queue.` : "None"}
                      </p>
                    )}
                  </div>
                ) : null}

                {/* Free court: let staff reshuffle the up-next teams */}
                {!live && next && open ? (
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => run(() => reshuffle(next))}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-inkSoft hover:text-ink"
                    >
                      <Shuffle className="w-3.5 h-3.5" /> Reshuffle teams
                    </button>
                  </div>
                ) : null}

                {live && open ? (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => run(() => cancelGame(live), "Game cancelled")}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-inkSoft hover:text-coral"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel game (no result)
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        {/* Side panel (a row of cards under the courts on narrower screens) */}
        <div
          className={cn(
            "grid gap-4 content-start md:grid-cols-2",
            session.courts >= 3 ? "xl:grid-cols-3 2xl:grid-cols-1" : "xl:grid-cols-1",
          )}
        >
          <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-bold text-lg text-ink">Queue</h2>
              <span className="text-xs text-inkSoft">{general.length} waiting · longest wait first</span>
            </div>
            {general.length === 0 ? (
              <p className="mt-3 text-sm text-inkSoft">Everyone is on a court or lined up next. Add players below.</p>
            ) : (
              <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-2.5">
                {general.map((r, i) => (
                  <li key={r.player_id} className="relative">
                    <span className="absolute -top-1.5 -left-0.5 z-10 rounded-full bg-ink px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">{i + 1}</span>
                    <PlayerToken
                      {...tokenProps({ kind: "queue", playerId: r.player_id }, r.player_id, false)}
                      size="sm"
                      meta={`${minutesSince(r.waiting_since)}m · ${gamesTonight(r.player_id)}g`}
                    />
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 rounded-2xl bg-cream/70 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-smallcaps text-inkSoft">
                <Coffee className="w-3.5 h-3.5" /> On a break
              </div>
              {benched.length === 0 ? (
                <p className="mt-1 text-xs text-inkSoft">Tap a player, then Take a break.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {benched.map((b) => (
                    <div key={b.player_id} className="opacity-60 hover:opacity-100 transition">
                      <PlayerToken
                        name={b.game_players.display_name}
                        rating={Number(b.game_players.rating)}
                        size="sm"
                        meta="tap: back in"
                        disabled={!open || busy}
                        onSelect={() => run(() => backIn(b.player_id), `${shortName(b.game_players.display_name)} is back in`)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {open ? (
            <AddPlayers
              data={data}
              busy={busy}
              onAdd={(id) => run(() => addToSession(id))}
              onCreate={(n, e, s) => run(() => addNewPlayer(n, e, s), `${n} added`)}
            />
          ) : null}

          <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-bold text-lg text-ink">Tonight</h2>
              <span className="text-xs text-inkSoft">{done.length} games</span>
            </div>
            {tonight.length === 0 ? (
              <p className="mt-2 text-sm text-inkSoft">Standings appear after the first result.</p>
            ) : (
              <ol className="mt-2 divide-y divide-border text-sm">
                {tonight.slice(0, 10).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 py-1.5">
                    <span className={cn("w-5 text-center font-bold tabular-nums", i === 0 ? "text-[#BA7517]" : "text-inkSoft")}>{i + 1}</span>
                    <span className="flex-1 truncate text-ink">{shortName(nameOf(t.id))}</span>
                    <span className="text-xs text-inkSoft tabular-nums">
                      {t.wins}W {t.games - t.wins}L
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums text-ink">{t.pts} pts</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-inkSoft">
              {Object.entries(TIER_STYLE).map(([k, t]) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.bg }} /> {t.label}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function BalanceRow({
  a,
  b,
  label,
  compact,
}: {
  a: Array<{ rating: number }>;
  b: Array<{ rating: number }>;
  label?: string;
  compact?: boolean;
}) {
  const bal = balanceOf(a, b);
  return (
    <div className={cn("flex items-center justify-center gap-2 text-xs", compact ? "mt-1.5" : "mt-2.5")}>
      {label ? <span className="text-inkSoft">{label}</span> : null}
      <span className="font-bold tabular-nums text-ink">{teamAverage(a).toFixed(1)}</span>
      <span className="text-inkSoft">vs</span>
      <span className="font-bold tabular-nums text-ink">{teamAverage(b).toFixed(1)}</span>
      <span className={cn("rounded-full px-2 py-0.5 font-bold", BALANCE_STYLE[bal.label])}>{bal.label}</span>
    </div>
  );
}

function AddPlayers({
  data,
  busy,
  onAdd,
  onCreate,
}: {
  data: BoardData;
  busy: boolean;
  onAdd: (playerId: string) => void;
  onCreate: (name: string, email: string, skill: Skill) => void;
}) {
  const [tab, setTab] = React.useState<"passes" | "search" | "new">(data.passes.length ? "passes" : "search");
  const [q, setQ] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [skill, setSkill] = React.useState<Skill>("intermediate");
  const inSession = new Set(data.roster.map((r) => r.player_id));
  const byEmail = new Map(data.master.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));

  const passList = data.passes
    .map((t) => ({ ...t, player: t.buyer_email ? byEmail.get(t.buyer_email.toLowerCase()) : undefined }))
    .filter((t) => !t.player || !inSession.has(t.player.id));
  const results = data.master
    .filter((p) => !inSession.has(p.id))
    .filter((p) => !q.trim() || `${p.display_name} ${p.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 12);

  return (
    <section className="rounded-3xl bg-white ring-1 ring-border shadow-card overflow-hidden">
      <div className="flex items-center gap-1 p-1.5 bg-cream/70">
        {(
          [
            ["passes", `Checked in ${passList.length ? `(${passList.length})` : ""}`],
            ["search", "Past players"],
            ["new", "New"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition", tab === k ? "bg-white text-ink shadow-card" : "text-inkSoft hover:text-ink")}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "passes" ? (
        passList.length === 0 ? (
          <p className="px-4 py-5 text-sm text-inkSoft">
            {data.session.event_id ? "Everyone checked in is already playing tonight." : "This session isn't linked to an event."}
          </p>
        ) : (
          <ul className="divide-y divide-border max-h-72 overflow-y-auto">
            {passList.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink">{t.player?.display_name ?? t.holder_name ?? "Guest"}</div>
                  <div className="truncate text-xs text-inkSoft">{t.ticket_type_name}</div>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => (t.player ? onAdd(t.player.id) : onCreate(t.holder_name ?? "Guest", t.buyer_email ?? "", "intermediate"))}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "search" ? (
        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-inkSoft absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-8" />
          </div>
          <ul className="divide-y divide-border max-h-64 overflow-y-auto">
            {results.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate text-ink">{p.display_name}</span>
                <span className="text-xs text-inkSoft tabular-nums">{Number(p.rating).toFixed(1)}</span>
                <Button size="sm" disabled={busy} onClick={() => onAdd(p.id)}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </li>
            ))}
            {results.length === 0 ? <li className="py-3 text-sm text-inkSoft">No matches. Use New.</li> : null}
          </ul>
        </div>
      ) : null}

      {tab === "new" ? (
        <form
          className="p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            onCreate(newName, newEmail, skill);
            setNewName("");
            setNewEmail("");
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="np_name" required>
              Name
            </Label>
            <Input id="np_name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np_email">Email</Label>
            <Input id="np_email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="So their points reach their account" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np_skill">Skill</Label>
            <Select id="np_skill" value={skill} onChange={(e) => setSkill(e.target.value as Skill)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="pro">Pro</option>
            </Select>
          </div>
          <Button type="submit" disabled={busy || !newName.trim()} className="w-full">
            <UserPlus className="w-4 h-4" /> Add to tonight
          </Button>
        </form>
      ) : null}
    </section>
  );
}
