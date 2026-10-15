"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coffee, Flag, Pencil, Play, RotateCcw, Shuffle, Trophy, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  balanceOf,
  fairOrder,
  formatLabel,
  leaguePoints,
  makePairs,
  makeSquads,
  MATCHUPS,
  minutesSince,
  nextUp,
  partnerCounts,
  rankedSplits,
  SKILL_RATING,
  SPORTS,
  SQUADS,
  teamAverage,
  type FairPlayer,
  type Skill,
  type Squad,
} from "../logic";
import { AddPlayers } from "./add-players";
import { CourtArt } from "./court-art";
import { PlayerToken, shortName, TIER_STYLE } from "./player-token";
import { ScoreModal, type ScoreTarget } from "./score-modal";
import { SquadsPanel } from "./squads-panel";

type Player = { id: string; display_name: string; email: string | null; rating: number; skill_level: Skill; seed_rating: number | null };
type Match = {
  id: string;
  court: number;
  team_a: string[];
  team_b: string[];
  score_a: number | null;
  score_b: number | null;
  winner: "a" | "b" | null;
  finish: "target" | "timed" | null;
  status: "queued" | "playing" | "done";
  started_at: string;
  finished_at: string | null;
};
type RosterRow = {
  player_id: string;
  active: boolean;
  waiting_since: string;
  joined_at: string;
  squad: Squad | null;
  pair_no: number | null;
  queue_offset: number;
  game_players: Player;
};
export type BoardData = {
  role: string;
  provisional: Record<string, boolean>;
  session: {
    id: string;
    sport: string;
    session_date: string;
    courts: number;
    team_size: number;
    status: "open" | "closed" | "finalized";
    ruleset: "casual" | "rally_rank";
    format: "classic" | "team" | "double" | "rivalry" | null;
    event_id: string | null;
    events: { name: string } | null;
  };
  roster: RosterRow[];
  matches: Match[];
  master: Player[];
  passes: Array<{ id: string; holder_name: string | null; buyer_email: string | null; ticket_type_name: string; checked_in_at: string }>;
};

// Where a player sits: a slot in a game (playing or queued), the general queue, or a squad list.
type Loc =
  | { kind: "match"; matchId: string; team: "a" | "b"; idx: number }
  | { kind: "queue"; playerId: string }
  | { kind: "squad"; playerId: string };
const enc = (l: Loc) => (l.kind === "match" ? `m:${l.matchId}:${l.team}:${l.idx}` : `${l.kind === "queue" ? "q" : "s"}:${l.playerId}`);
const dec = (s: string): Loc | null => {
  const p = s.split(":");
  if (p[0] === "m" && p.length === 4) return { kind: "match", matchId: p[1], team: p[2] as "a" | "b", idx: Number(p[3]) };
  if (p[0] === "q" && p.length === 2) return { kind: "queue", playerId: p[1] };
  if (p[0] === "s" && p.length === 2) return { kind: "squad", playerId: p[1] };
  return null;
};

const BALANCE_STYLE = {
  Fair: "bg-greenBg text-green",
  Close: "bg-yellowBg text-[#854F0B]",
  Uneven: "bg-salmonBg text-coral",
} as const;

const fmtMins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);
const matchupKey = (x: string | null, y: string | null) => [x ?? "", y ?? ""].sort().join("");

export function GameBoard({ data }: { data: BoardData }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = data;
  const sport = SPORTS.find((s) => s.value === session.sport);
  const ranked = session.ruleset === "rally_rank";
  const isTeam = ranked && session.format === "team";
  const open = session.status === "open";
  const need = session.team_size * 2;
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Loc | null>(null);
  const [shuffleIdx, setShuffleIdx] = React.useState<Record<string, number>>({});
  const [scoring, setScoring] = React.useState<ScoreTarget | null>(null);
  const [finalizing, setFinalizing] = React.useState(false);
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
  const rating = (id: string) => Number(byId.get(id)?.rating ?? 2.5);
  const nameOf = (id: string) => byId.get(id)?.display_name ?? "Unknown";
  const P = (id: string) => ({ id, rating: rating(id), waiting_since: "" });
  const rosterById = new Map(data.roster.map((r) => [r.player_id, r]));
  const squadOf = (id: string) => rosterById.get(id)?.squad ?? null;

  const playing = data.matches.filter((m) => m.status === "playing");
  const queued = data.matches.filter((m) => m.status === "queued");
  const done = data.matches.filter((m) => m.status === "done");
  const inLineup = new Set([...playing, ...queued].flatMap((m) => [...m.team_a, ...m.team_b]));
  const onCourt = new Set(playing.flatMap((m) => [...m.team_a, ...m.team_b]));
  const gamesTonight = (id: string) => done.filter((m) => m.team_a.includes(id) || m.team_b.includes(id)).length;
  const fair = (r: RosterRow): FairPlayer & { squad: Squad | null; pair_no: number | null } => ({
    id: r.player_id,
    rating: rating(r.player_id),
    waiting_since: r.waiting_since,
    joined_at: r.joined_at,
    opportunities: gamesTonight(r.player_id) + r.queue_offset,
    squad: r.squad,
    pair_no: r.pair_no,
  });
  const general = fairOrder(data.roster.filter((r) => r.active && !inLineup.has(r.player_id)).map(fair));
  const benched = data.roster.filter((r) => !r.active);
  const minOpportunities = () => {
    const act = data.roster.filter((r) => r.active).map((r) => gamesTonight(r.player_id) + r.queue_offset);
    return act.length ? Math.min(...act) : 0;
  };

  // Squad record from finished games (team nights).
  const squadRecord = Object.fromEntries(SQUADS.map((s) => [s, { w: 0, g: 0, pd: 0 }])) as Record<Squad, { w: number; g: number; pd: number }>;
  for (const m of done) {
    const sa = squadOf(m.team_a[0]);
    const sb = squadOf(m.team_b[0]);
    if (!sa || !sb || sa === sb) continue;
    const pd = (m.score_a ?? 0) - (m.score_b ?? 0);
    squadRecord[sa].g++;
    squadRecord[sb].g++;
    squadRecord[sa].pd += pd;
    squadRecord[sb].pd -= pd;
    if (m.winner === "a") squadRecord[sa].w++;
    else squadRecord[sb].w++;
  }

  // Opening the board fills any court that has no "next" lineup yet.
  const needsFill = open && general.length >= need && Array.from({ length: session.courts }, (_, i) => i + 1).some((c) => !queued.some((q) => q.court === c));
  const filledOnce = React.useRef(false);
  React.useEffect(() => {
    if (!needsFill || filledOnce.current) return;
    filledOnce.current = true;
    run(async () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFill]);

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

  /** Give every court without a "next" lineup one, in fairness order (spec section 5). */
  async function refill() {
    if (!open) return;
    const supabase = createClient();
    const [{ data: ms }, { data: rs }] = await Promise.all([
      supabase.from("game_matches").select("id, court, team_a, team_b, status").eq("session_id", session.id).in("status", ["queued", "playing", "done"]),
      supabase.from("game_session_players").select("player_id, active, waiting_since, joined_at, squad, pair_no, queue_offset").eq("session_id", session.id),
    ]);
    const matches = (ms ?? []) as Array<{ court: number; team_a: string[]; team_b: string[]; status: string }>;
    const rows = (rs ?? []) as Array<Omit<RosterRow, "game_players">>;
    const squadById = new Map(rows.map((r) => [r.player_id, r.squad]));
    const history = matches.filter((m) => m.status === "done");
    const games = new Map<string, number>();
    for (const m of history) for (const id of [...m.team_a, ...m.team_b]) games.set(id, (games.get(id) ?? 0) + 1);
    const taken = new Set(matches.filter((m) => m.status !== "done").flatMap((m) => [...m.team_a, ...m.team_b]));
    let pool = rows
      .filter((r) => r.active && !taken.has(r.player_id))
      .map((r) => ({
        id: r.player_id,
        rating: rating(r.player_id),
        waiting_since: r.waiting_since,
        joined_at: r.joined_at,
        opportunities: (games.get(r.player_id) ?? 0) + r.queue_offset,
        squad: r.squad,
        pair_no: r.pair_no,
      }));
    // Team nights: run the matchup with the fewest games so far (A v B, B v C, C v A).
    const matchupGames = new Map<string, number>();
    for (const m of matches) {
      const k = matchupKey(squadById.get(m.team_a[0]) ?? null, squadById.get(m.team_b[0]) ?? null);
      matchupGames.set(k, (matchupGames.get(k) ?? 0) + 1);
    }
    const pickTwo = (list: typeof pool) => {
      const f = fairOrder(list);
      if (f.length < 2) return null;
      const first = f[0];
      const mate = first.pair_no != null ? f.find((p) => p !== first && p.pair_no === first.pair_no) : undefined;
      return [first, mate ?? f[1]];
    };

    for (let court = 1; court <= session.courts; court++) {
      if (matches.some((m) => m.court === court && m.status === "queued")) continue;
      let lineup: [typeof pool, typeof pool] | null = null;
      if (isTeam) {
        const order = MATCHUPS.map((mu, i) => ({ mu, i, c: matchupGames.get(matchupKey(mu[0], mu[1])) ?? 0 })).sort((x, y) => x.c - y.c || x.i - y.i);
        for (const { mu } of order) {
          const a = pickTwo(pool.filter((p) => p.squad === mu[0]));
          const b = pickTwo(pool.filter((p) => p.squad === mu[1]));
          if (a && b) {
            lineup = [a, b];
            const k = matchupKey(mu[0], mu[1]);
            matchupGames.set(k, (matchupGames.get(k) ?? 0) + 1);
            break;
          }
        }
      } else {
        const players = nextUp(pool, session.team_size);
        if (players) lineup = rankedSplits(players, partnerCounts(history))[0];
      }
      if (!lineup) break;
      const [a, b] = lineup;
      const { error } = await supabase
        .from("game_matches")
        .insert({ session_id: session.id, court, status: "queued", team_a: a.map((p) => p.id), team_b: b.map((p) => p.id) });
      if (error && error.code !== "23505") throw new Error(error.message);
      const used = new Set([...a, ...b].map((p) => p.id));
      pool = pool.filter((p) => !used.has(p.id));
    }
  }

  async function startQueued(m: Pick<Match, "id" | "court">) {
    const { error } = await createClient()
      .from("game_matches")
      .update({ status: "playing", started_at: new Date().toISOString() })
      .eq("id", m.id)
      .eq("status", "queued");
    if (error) throw new Error(error.code === "23505" ? `Court ${m.court} already has a game on.` : error.message);
  }

  async function saveResult(t: ScoreTarget, winner: "a" | "b", a: number | null, b: number | null, finish: "target" | "timed") {
    const wasLive = playing.some((m) => m.id === t.matchId);
    const { error } = await createClient().rpc("rr_record_result", {
      p_match: t.matchId,
      p_winner: winner,
      p_score_a: a,
      p_score_b: b,
      p_finish: finish,
    });
    if (error) throw new Error(error.message);
    setScoring(null);
    // The court's next four walk straight on.
    const next = wasLive ? queued.find((q) => q.court === t.court) : undefined;
    if (next) await startQueued(next);
  }

  async function voidGame(m: Match) {
    const { error } = await createClient().rpc("rr_void_match", { p_match: m.id });
    if (error) throw new Error(error.message);
  }

  async function reshuffle(m: Match) {
    const players = [...m.team_a, ...m.team_b].map((id) => ({ ...P(id), joined_at: "", opportunities: 0 }));
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
    if (l.kind !== "match") return l.playerId;
    const m = data.matches.find((x) => x.id === l.matchId);
    return m ? (l.team === "a" ? m.team_a : m.team_b)[l.idx] ?? null : null;
  }

  async function swap(a: Loc, b: Loc) {
    const ia = idAt(a);
    const ib = idAt(b);
    if (!ia || !ib || ia === ib) return;
    const supabase = createClient();
    const upd = (id: string, v: Record<string, unknown>) =>
      supabase.from("game_session_players").update(v).eq("session_id", session.id).eq("player_id", id);
    if (a.kind === "squad" && b.kind === "squad") {
      // Swap squads and pairs.
      const ra = rosterById.get(ia)!;
      const rb = rosterById.get(ib)!;
      await upd(ia, { squad: rb.squad, pair_no: rb.pair_no });
      await upd(ib, { squad: ra.squad, pair_no: ra.pair_no });
      return;
    }
    if (a.kind === "queue" && b.kind === "queue") {
      // Swap queue positions (games + offset and wait time move together).
      const ra = rosterById.get(ia)!;
      const rb = rosterById.get(ib)!;
      await upd(ia, { waiting_since: rb.waiting_since, queue_offset: rb.queue_offset + gamesTonight(ib) - gamesTonight(ia) });
      await upd(ib, { waiting_since: ra.waiting_since, queue_offset: ra.queue_offset + gamesTonight(ia) - gamesTonight(ib) });
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
    // Squad lists swap only with each other; court/queue swaps only with each other.
    if ((selected.kind === "squad") !== (l.kind === "squad")) return setSelected(l);
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
    // A break earns no queue credit: catch their count up to the current minimum.
    const r = rosterById.get(playerId)!;
    const offset = Math.max(r.queue_offset, minOpportunities() - gamesTonight(playerId));
    const { error } = await createClient()
      .from("game_session_players")
      .update({ active: true, waiting_since: new Date().toISOString(), queue_offset: offset })
      .eq("session_id", session.id)
      .eq("player_id", playerId);
    if (error) throw new Error(error.message);
  }

  async function seed(playerId: string, level: Skill) {
    const r = SKILL_RATING[level];
    const now = new Date().toISOString();
    const { error } = await createClient()
      .from("game_players")
      .update({ skill_level: level, seed_rating: r, rating: r, seeded_at: now, updated_at: now })
      .eq("id", playerId)
      .is("seed_rating", null);
    if (error) throw new Error(error.message);
  }

  async function addToSession(playerId: string, level: Skill | null) {
    if (level) await seed(playerId, level);
    // Late arrivals start level with the current minimum so they can't jump the line repeatedly.
    const { error } = await createClient().from("game_session_players").upsert({
      session_id: session.id,
      player_id: playerId,
      active: true,
      waiting_since: new Date().toISOString(),
      queue_offset: done.length ? minOpportunities() : 0,
    });
    if (error) throw new Error(error.message);
  }

  async function addNewPlayer(displayName: string, email: string, level: Skill) {
    const clean = email.trim().toLowerCase() || null;
    if (clean) {
      const existing = data.master.find((p) => (p.email ?? "").toLowerCase() === clean);
      if (existing) return addToSession(existing.id, existing.seed_rating == null ? level : null);
    }
    const r = SKILL_RATING[level];
    const { data: row, error } = await createClient()
      .from("game_players")
      .insert({ display_name: displayName.trim(), email: clean, skill_level: level, rating: r, seed_rating: r, seeded_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23505" ? "A player with that email already exists. Search for them instead." : error.message);
    await addToSession(row.id, null);
  }

  async function generateSquads() {
    const supabase = createClient();
    // Fresh squads replace any lineups already waiting.
    await supabase.from("game_matches").delete().eq("session_id", session.id).eq("status", "queued");
    const sq = makeSquads(data.roster.map((r) => ({ id: r.player_id, rating: rating(r.player_id) })));
    for (const s of SQUADS)
      for (const p of sq[s]) {
        const { error } = await supabase.from("game_session_players").update({ squad: s, pair_no: null }).eq("session_id", session.id).eq("player_id", p.id);
        if (error) throw new Error(error.message);
      }
  }

  async function pairUp() {
    const supabase = createClient();
    await supabase.from("game_matches").delete().eq("session_id", session.id).eq("status", "queued");
    for (const s of SQUADS) {
      const members = data.roster.filter((r) => r.squad === s).map((r) => ({ id: r.player_id, rating: rating(r.player_id) }));
      const pairs = makePairs(members);
      for (let i = 0; i < pairs.length; i++)
        for (const p of pairs[i]) {
          if (!p) continue;
          const { error } = await supabase.from("game_session_players").update({ pair_no: i + 1 }).eq("session_id", session.id).eq("player_id", p.id);
          if (error) throw new Error(error.message);
        }
    }
  }

  async function moveToSquad(playerId: string, s: Squad) {
    const { error } = await createClient()
      .from("game_session_players")
      .update({ squad: s, pair_no: null })
      .eq("session_id", session.id)
      .eq("player_id", playerId);
    if (error) throw new Error(error.message);
  }

  async function closeSession() {
    const supabase = createClient();
    await supabase.from("game_matches").delete().eq("session_id", session.id).eq("status", "queued");
    const { error } = await supabase.from("game_sessions").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", session.id);
    if (error) throw new Error(error.message);
  }

  async function finalize() {
    const { error } = await createClient().rpc("rr_finalize_session", { p_session: session.id });
    if (error) throw new Error(error.message);
    setFinalizing(false);
  }

  async function reopen() {
    const { error } = await createClient().rpc("rr_reopen_session", { p_session: session.id });
    if (error) throw new Error(error.message);
  }

  // Tonight's standings: Rally & Rank LP (bonuses land at finalize), casual = wins.
  const tonight = data.roster
    .map((r) => {
      const games = done.filter((m) => m.team_a.includes(r.player_id) || m.team_b.includes(r.player_id));
      const wins = games.filter((m) => (m.winner === "a" ? m.team_a : m.team_b).includes(r.player_id)).length;
      const pd = games.reduce((a, m) => a + (m.team_a.includes(r.player_id) ? 1 : -1) * ((m.score_a ?? 0) - (m.score_b ?? 0)), 0);
      return { id: r.player_id, wins, n: games.length, pd, lp: leaguePoints(games.length, wins, session.format) };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.lp - a.lp || b.wins / b.n - a.wins / a.n || b.wins - a.wins || b.n - a.n || b.pd / b.n - a.pd / a.n);

  const selectedId = selected ? idAt(selected) : null;
  const isSel = (l: Loc) => !!selected && enc(selected) === enc(l);
  const tokenProps = (l: Loc, id: string, onCourtStyle: boolean) => ({
    name: nameOf(id),
    rating: rating(id),
    provisional: ranked && (data.provisional[id] ?? true),
    selected: isSel(l),
    onCourt: onCourtStyle,
    dragData: open ? enc(l) : undefined,
    onSelect: () => pick(l),
    onDropData: open
      ? (from: string) => {
          const f = dec(from);
          if (f && (f.kind === "squad") === (l.kind === "squad")) run(() => swap(f, l), "Swapped");
        }
      : undefined,
    disabled: !open || busy,
  });
  const teamLabel = (ids: string[]) => {
    const s = isTeam ? squadOf(ids[0]) : null;
    return s ? `Squad ${s}` : null;
  };

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
        {ranked ? (
          <span className="rounded-full bg-berry text-white px-2.5 py-0.5 text-xs font-bold">Rally &amp; Rank · {formatLabel(session.format)}</span>
        ) : (
          <span className="rounded-full bg-cream ring-1 ring-border px-2.5 py-0.5 text-xs text-inkSoft">Casual · not ranked</span>
        )}
        {ranked ? (
          <span className="rounded-full bg-cream ring-1 ring-border px-2.5 py-0.5 text-xs text-inkSoft">
            Games to 21 · LP = {session.format === "double" ? "2 × " : ""}(20 + 80 × win rate)
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {session.status === "finalized" ? (
            <>
              <span className="text-xs font-semibold rounded-full bg-greenBg text-green px-2.5 py-1">Finalized · LP counts toward the season</span>
              {["owner", "partner"].includes(data.role) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => window.confirm("Reopen this event to correct results? Its LP leaves the season table until you finalize again.") && run(reopen, "Event reopened")}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reopen
                </Button>
              ) : null}
            </>
          ) : open ? (
            ranked ? (
              <Button onClick={() => setFinalizing(true)} disabled={busy}>
                <Flag className="w-4 h-4" /> Finalize event
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => run(closeSession, "Session closed")} disabled={busy || playing.length > 0} title={playing.length ? "Finish games on court first" : ""}>
                Close session
              </Button>
            )
          ) : (
            <span className="text-xs font-semibold rounded-full bg-cream text-inkSoft px-2 py-0.5">Closed</span>
          )}
        </div>
      </div>

      {/* Selection bar */}
      {selectedId ? (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-ink text-white px-4 py-2.5 shadow-lg">
          <span className="text-sm">
            <span className="font-semibold">{shortName(nameOf(selectedId))}</span> selected.{" "}
            {selected?.kind === "squad" ? "Tap another squad player to swap, or Move here on a squad." : "Tap another player to swap."}
          </span>
          <div className="ml-auto flex gap-2">
            {!onCourt.has(selectedId) && selected?.kind !== "squad" ? (
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

      {isTeam ? (
        <SquadsPanel
          members={data.roster.map((r) => ({ player_id: r.player_id, squad: r.squad, pair_no: r.pair_no, active: r.active, rating: rating(r.player_id) }))}
          record={squadRecord}
          open={open}
          busy={busy}
          moving={selected?.kind === "squad"}
          token={(id) => (
            <div className={cn(!rosterById.get(id)?.active && "opacity-50")}>
              <PlayerToken size="sm" {...tokenProps({ kind: "squad", playerId: id }, id, false)} />
            </div>
          )}
          onGenerate={() => run(generateSquads, "Squads ready")}
          onPair={() => run(pairUp, "Pairs set")}
          onMoveTo={(s) => {
            if (selected?.kind === "squad" && s) {
              const id = selected.playerId;
              run(() => moveToSquad(id, s), `Moved to squad ${s}`);
            }
          }}
        />
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
                        const label = teamLabel(ids);
                        return (
                          <div
                            key={team}
                            className={cn("relative flex items-center justify-center gap-3 px-2 py-4", team === "a" ? "flex-col" : "flex-col-reverse")}
                          >
                            {label ? <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-ink">{label}</span> : null}
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
                                onClick={() => setScoring({ matchId: live.id, court, teamA: live.team_a, teamB: live.team_b, winner: team })}
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
                        {!open
                          ? "Court free"
                          : isTeam && !data.roster.some((r) => r.squad)
                            ? "Generate squads to start"
                            : waitingFor === 0
                              ? "Lining up next game"
                              : `Waiting for ${waitingFor} more player${waitingFor === 1 ? "" : "s"}`}
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
                      {next && open && !isTeam ? (
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
                          <span className="text-[10px] font-bold uppercase text-inkSoft">
                            {isTeam ? `${teamLabel(next.team_a) ?? ""} vs ${teamLabel(next.team_b) ?? ""}` : "vs"}
                          </span>
                          <div className="flex flex-wrap justify-center gap-1">
                            {next.team_b.map((id, idx) => (
                              <PlayerToken key={id} size="sm" {...tokenProps({ kind: "match", matchId: next.id, team: "b", idx }, id, false)} />
                            ))}
                          </div>
                        </div>
                        <BalanceRow a={next.team_a.map(P)} b={next.team_b.map(P)} compact />
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-inkSoft">{!open ? "None" : waitingFor === 0 ? "Lining up…" : `Waiting for ${waitingFor} more in the queue.`}</p>
                    )}
                  </div>
                ) : null}

                {/* Free court: let staff reshuffle the up-next teams */}
                {!live && next && open && !isTeam ? (
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
                      onClick={() => run(() => voidGame(live), "Game cancelled")}
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
        <div className={cn("grid gap-4 content-start md:grid-cols-2", session.courts >= 3 ? "xl:grid-cols-3 2xl:grid-cols-1" : "xl:grid-cols-1")}>
          <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-bold text-lg text-ink">Queue</h2>
              <span className="text-xs text-inkSoft">{general.length} waiting · fewest games first</span>
            </div>
            {general.length === 0 ? (
              <p className="mt-3 text-sm text-inkSoft">Everyone is on a court or lined up next. Add players below.</p>
            ) : (
              <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-2.5">
                {general.map((r, i) => (
                  <li key={r.id} className="relative">
                    <span className="absolute -top-1.5 -left-0.5 z-10 rounded-full bg-ink px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">{i + 1}</span>
                    <PlayerToken
                      {...tokenProps({ kind: "queue", playerId: r.id }, r.id, false)}
                      size="sm"
                      meta={`${gamesTonight(r.id)}g · ${fmtMins(minutesSince(r.waiting_since))}${isTeam && r.squad ? ` · ${r.squad}` : ""}`}
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
                        provisional={ranked && (data.provisional[b.player_id] ?? true)}
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
              master={data.master}
              passes={data.passes}
              inSession={new Set(data.roster.map((r) => r.player_id))}
              hasEvent={!!session.event_id}
              busy={busy}
              onAdd={(id, level) => run(() => addToSession(id, level))}
              onCreate={(n, e, s) => run(() => addNewPlayer(n, e, s), `${n} added`)}
            />
          ) : null}

          <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-bold text-lg text-ink">Tonight</h2>
              <span className="text-xs text-inkSoft">
                {done.length} games{ranked && session.status !== "finalized" ? " · LP before bonuses" : ""}
              </span>
            </div>
            {tonight.length === 0 ? (
              <p className="mt-2 text-sm text-inkSoft">Standings appear after the first result.</p>
            ) : (
              <ol className="mt-2 divide-y divide-border text-sm">
                {tonight.slice(0, 12).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 py-1.5">
                    <span className={cn("w-5 text-center font-bold tabular-nums", i === 0 ? "text-[#BA7517]" : "text-inkSoft")}>{i + 1}</span>
                    <span className="flex-1 truncate text-ink">{shortName(nameOf(t.id))}</span>
                    <span className="text-xs text-inkSoft tabular-nums">
                      {t.wins}W {t.n - t.wins}L{ranked && t.n < 4 ? " ·p" : ""}
                    </span>
                    {ranked ? <span className="w-16 text-right font-semibold tabular-nums text-ink">{t.lp.toFixed(2)}</span> : null}
                  </li>
                ))}
              </ol>
            )}
            {ranked && tonight.some((t) => t.n < 4) ? <p className="mt-1 text-[11px] text-inkSoft">p = fewer than 4 games, LP scaled down.</p> : null}

            {done.length ? (
              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-smallcaps text-inkSoft">Results</div>
                <ul className="mt-1.5 space-y-1">
                  {[...done].reverse().slice(0, 10).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-lg bg-cream/60 px-2 py-1.5 text-xs">
                      <span className="font-bold text-inkSoft">C{m.court}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className={cn(m.winner === "a" ? "font-bold text-ink" : "text-inkSoft")}>{m.team_a.map((id) => shortName(nameOf(id))).join(" & ")}</span>
                        <span className="px-1 font-bold tabular-nums text-ink">{m.score_a != null ? `${m.score_a}–${m.score_b}` : "v"}</span>
                        <span className={cn(m.winner === "b" ? "font-bold text-ink" : "text-inkSoft")}>{m.team_b.map((id) => shortName(nameOf(id))).join(" & ")}</span>
                        {m.finish === "timed" ? <span className="text-inkSoft"> · time</span> : null}
                      </span>
                      {open ? (
                        <>
                          <button
                            type="button"
                            aria-label="Edit result"
                            onClick={() =>
                              setScoring({
                                matchId: m.id,
                                court: m.court,
                                teamA: m.team_a,
                                teamB: m.team_b,
                                winner: m.winner ?? "a",
                                scoreA: m.score_a,
                                scoreB: m.score_b,
                                finish: m.finish,
                              })
                            }
                            className="text-inkSoft hover:text-ink"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Void result"
                            onClick={() => window.confirm("Void this result? It stops counting for LP and ratings.") && run(() => voidGame(m), "Result voided")}
                            className="text-inkSoft hover:text-coral"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-inkSoft">
              {Object.entries(TIER_STYLE).map(([k, t]) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.bg }} /> {t.label}
                </span>
              ))}
              {ranked ? (
                <span className="inline-flex items-center gap-1">
                  <span className="rounded-full bg-ink px-1 text-[8px] font-bold leading-[13px] text-white">P</span> Provisional (first 2 events)
                </span>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <ScoreModal
        target={scoring}
        ranked={ranked}
        nameOf={nameOf}
        busy={busy}
        onClose={() => setScoring(null)}
        onSave={(w, a, b, f) => {
          const t = scoring;
          if (t) run(() => saveResult(t, w, a, b, f), "Result saved");
        }}
      />

      {finalizing ? (
        <FinalizeModal
          format={session.format}
          liveCount={playing.length}
          rows={tonight.map((t) => ({ ...t, name: nameOf(t.id) }))}
          zero={data.roster.length - tonight.length}
          squads={isTeam ? squadRecord : null}
          busy={busy}
          onClose={() => setFinalizing(false)}
          onConfirm={() => run(finalize, "Event finalized. LP is on the season table.")}
        />
      ) : null}
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
      <span className="font-bold tabular-nums text-ink">{teamAverage(a).toFixed(2)}</span>
      <span className="text-inkSoft">vs</span>
      <span className="font-bold tabular-nums text-ink">{teamAverage(b).toFixed(2)}</span>
      <span className={cn("rounded-full px-2 py-0.5 font-bold", BALANCE_STYLE[bal.label])}>{bal.label}</span>
    </div>
  );
}

function FinalizeModal({
  format,
  liveCount,
  rows,
  zero,
  squads,
  busy,
  onClose,
  onConfirm,
}: {
  format: string | null;
  liveCount: number;
  rows: Array<{ id: string; name: string; n: number; wins: number; lp: number }>;
  zero: number;
  squads: Record<Squad, { w: number; g: number; pd: number }> | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const prorated = rows.filter((r) => r.n < 4).length;
  const squadOrder = squads
    ? SQUADS.filter((s) => squads[s].g > 0).sort(
        (x, y) => squads[y].w / squads[y].g - squads[x].w / squads[x].g || squads[y].pd / squads[y].g - squads[x].pd / squads[x].g || squads[y].w - squads[x].w,
      )
    : [];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Finalize event"
      description="Locks tonight's results. LP then counts toward the season leaderboard."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button onClick={onConfirm} disabled={busy || liveCount > 0 || rows.length === 0}>
            <Flag className="w-4 h-4" /> Finalize
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {liveCount > 0 ? (
          <p className="rounded-lg bg-salmonBg px-3 py-2 text-coral">
            {liveCount} game{liveCount === 1 ? " is" : "s are"} still on court. Save the result or cancel {liveCount === 1 ? "it" : "them"} first.
          </p>
        ) : null}
        {rows.length === 0 ? <p className="text-inkSoft">No results yet.</p> : null}
        {prorated ? (
          <p className="rounded-lg bg-yellowBg px-3 py-2 text-[#854F0B]">
            {prorated} player{prorated === 1 ? "" : "s"} played fewer than 4 games, so their LP is scaled down (games ÷ 4).
          </p>
        ) : null}
        {zero > 0 ? <p className="text-inkSoft">{zero} checked-in player{zero === 1 ? "" : "s"} with no games get 0 LP.</p> : null}

        {squads ? (
          <div>
            <div className="text-xs font-bold uppercase tracking-smallcaps text-inkSoft">Squad standings</div>
            <ol className="mt-1.5 grid grid-cols-3 gap-2">
              {squadOrder.map((s, i) => (
                <li key={s} className="rounded-xl bg-cream px-3 py-2">
                  <div className="font-serif font-bold text-ink">
                    {i + 1}. Squad {s}
                  </div>
                  <div className="text-xs text-inkSoft tabular-nums">
                    {squads[s].w}W {squads[s].g - squads[s].w}L · {i === 0 ? "+10 LP" : i === 1 ? "+5 LP" : "no bonus"}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-[11px] text-inkSoft">Bonus is scaled by each player&apos;s own games (under 4 = less). Ties go to head-to-head, then point difference.</p>
          </div>
        ) : null}

        <div className="max-h-72 overflow-y-auto rounded-lg ring-1 ring-border">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft text-xs">
              <tr>
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">Player</th>
                <th className="px-3 py-1.5 text-right">Games</th>
                <th className="px-3 py-1.5 text-right">Wins</th>
                <th className="px-3 py-1.5 text-right">LP{format === "team" ? " (before bonus)" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5 tabular-nums text-inkSoft">{i + 1}</td>
                  <td className="px-3 py-1.5 text-ink">{r.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.n}
                    {r.n < 4 ? <span className="text-inkSoft"> ·p</span> : null}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.wins}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{r.lp.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
