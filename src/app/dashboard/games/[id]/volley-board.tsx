"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Coffee, Flag, Pencil, Play, RotateCcw, Shuffle, Undo2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatLabel } from "../logic";
import {
  blockLabels,
  deficits,
  generateTeams,
  roundSchedule,
  suggestedTeams,
  teamSizes,
  teamsFit,
  VB_LEVELS,
  VB_TAGS,
  vbDivision,
  vbLeaguePoints,
  type VbOutcome,
} from "../volley";
import { AddPlayers } from "./add-players";
import { CourtArt } from "./court-art";
import { PlayerToken, shortName } from "./player-token";
import { VolleyResultModal, type VbResultTarget } from "./volley-result";

type Player = { id: string; display_name: string; email: string | null; rating: number; seed_rating: number | null };
type VbRating = { player_id: string; rating: number; rated_count: number; level: string | null; tags: string[] };
type Match = {
  id: string;
  game_no: number;
  block: number;
  label_a: string;
  label_b: string;
  team_a: string[];
  team_b: string[];
  score_a: number | null;
  score_b: number | null;
  winner: "a" | "b" | null;
  outcome: VbOutcome | null;
  is_draw: boolean;
  status: "scheduled" | "playing" | "done" | "void";
};
type RosterRow = {
  player_id: string;
  active: boolean;
  joined_at: string;
  block1_team: string | null;
  block2_team: string | null;
  game_players: Player;
};
export type VolleyData = {
  role: string;
  session: {
    id: string;
    title: string | null;
    format: "classic" | "team" | "double" | "rivalry" | null;
    status: "open" | "closed" | "finalized" | "cancelled";
    session_date: string;
    event_id: string | null;
    events: { name: string } | null;
    rivalry_games: number[];
  };
  roster: RosterRow[];
  matches: Match[];
  master: Player[];
  ratings: VbRating[];
  passes: Array<{ id: string; holder_name: string | null; buyer_email: string | null; ticket_type_name: string; checked_in_at: string }>;
};

// Division colours (staff only), same palette as the badminton badges.
const DIV_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  foundation: { bg: "#C0DD97", fg: "#27500A", label: "Foundation" },
  developing: { bg: "#B5D4F4", fg: "#0C447C", label: "Developing" },
  intermediate: { bg: "#CECBF6", fg: "#3C3489", label: "Intermediate" },
  advanced: { bg: "#FAC775", fg: "#633806", label: "Advanced" },
};
const TEAM_STYLE: Record<string, string> = {
  A: "bg-[#FBEAF0] ring-[#F4C0D1]",
  B: "bg-[#E6F1FB] ring-[#B5D4F4]",
  C: "bg-[#EAF3DE] ring-[#C0DD97]",
  D: "bg-[#FDF1DC] ring-[#FAC775]",
  E: "bg-[#FBEAF0] ring-[#F4C0D1]",
  F: "bg-[#E6F1FB] ring-[#B5D4F4]",
  G: "bg-[#EAF3DE] ring-[#C0DD97]",
  H: "bg-[#FDF1DC] ring-[#FAC775]",
};

export function VolleyBoard({ data }: { data: VolleyData }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = data;
  const open = session.status === "open";
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<{ block: 1 | 2; id: string } | null>(null);
  const [tab, setTab] = React.useState<1 | 2>(1);
  const [result, setResult] = React.useState<VbResultTarget | null>(null);
  const [finalizing, setFinalizing] = React.useState(false);

  const rmap = React.useMemo(() => new Map(data.ratings.map((r) => [r.player_id, r])), [data.ratings]);
  const byId = React.useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of data.master) m.set(p.id, p);
    for (const r of data.roster) m.set(r.player_id, r.game_players);
    return m;
  }, [data]);
  const rating = (id: string) => Number(rmap.get(id)?.rating ?? 3);
  const nameOf = (id: string) => byId.get(id)?.display_name ?? "Unknown";
  const tagsOf = (id: string) => rmap.get(id)?.tags ?? [];
  const provisional = (id: string) => (rmap.get(id)?.rated_count ?? 0) < 5;
  const teamOf = (r: RosterRow, block: 1 | 2) => (block === 1 ? r.block1_team : r.block2_team);

  const matches = [...data.matches].sort((a, b) => a.game_no - b.game_no);
  const done = matches.filter((m) => m.status === "done");
  const hasBlock = (b: 1 | 2) => data.roster.some((r) => teamOf(r, b));
  const blockStarted = (b: 1 | 2) => matches.some((m) => m.block === b && m.status !== "scheduled");
  const current = matches.find((m) => m.status === "playing") ?? matches.find((m) => m.status === "scheduled");
  // Teams in a round (the count can differ between rounds if attendance changes).
  const labelsOf = (b: number) =>
    Array.from(new Set([...data.roster.map((r) => teamOf(r, b as 1 | 2)), ...matches.filter((m) => m.block === b).flatMap((m) => [m.label_a, m.label_b])]))
      .filter((x): x is string => !!x)
      .sort();
  const needRound2 = matches.length > 0 && matches.every((m) => m.block === 1 && m.status === "done");
  const checkedInCount = data.roster.filter((r) => r.active).length;
  const [teamPick, setTeamPick] = React.useState<Record<number, number | null>>({ 1: null, 2: null });
  const teamsFor = (b: 1 | 2) => teamPick[b] ?? (hasBlock(b) ? labelsOf(b).length : suggestedTeams(checkedInCount));
  const nextUp = current ? matches.find((m) => m.game_no > current.game_no && m.status === "scheduled") : undefined;

  React.useEffect(() => {
    if (current && current.block === 2) setTab(2);
  }, [current?.block]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>, ok?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) toast.push(ok, "success");
    } catch (e) {
      toast.push((e as Error).message, "error");
    } finally {
      setSelected(null);
      setBusy(false);
      router.refresh();
    }
  }
  const sb = () => createClient();
  const updRoster = (id: string, v: Record<string, unknown>) => sb().from("game_session_players").update(v).eq("session_id", session.id).eq("player_id", id);

  // ---------------------------------------------------------------- teams
  async function generate(block: 1 | 2, k: number) {
    const labels = blockLabels(block, k);
    const pool = data.roster.filter((r) => r.active);
    if (!teamsFit(pool.length, k)) throw new Error(`${pool.length} players can't make ${k} teams of 6. Pick fewer teams.`);
    // Round 2 balances on the ratings players had before tonight's first game (frozen).
    let frozen = new Map<string, number>();
    if (block === 2) {
      const ids = matches.map((m) => m.id);
      const { data: led } = ids.length
        ? await sb().from("vb_rating_ledger").select("player_id, prior, seq").in("match_id", ids).order("seq")
        : { data: [] };
      for (const l of (led ?? []) as Array<{ player_id: string; prior: number }>) if (!frozen.has(l.player_id)) frozen.set(l.player_id, Number(l.prior));
    } else frozen = new Map();
    const prev = block === 2 ? new Map(data.roster.filter((r) => r.block1_team).map((r) => [r.player_id, r.block1_team as string])) : undefined;
    const { teams, metrics } = generateTeams(
      pool.map((r) => ({ id: r.player_id, rating: frozen.get(r.player_id) ?? rating(r.player_id), tags: tagsOf(r.player_id) })),
      labels,
      `${session.id}:${block}`,
      prev,
    );
    const col = block === 1 ? "block1_team" : "block2_team";
    for (const r of data.roster) {
      const label = Object.entries(teams).find(([, ids]) => ids.includes(r.player_id))?.[0] ?? null;
      const { error } = await updRoster(r.player_id, { [col]: label });
      if (error) throw new Error(error.message);
    }
    // Each round's 6 games are (re)built for its team count.
    await sb().from("game_matches").delete().eq("session_id", session.id).eq("block", block).eq("status", "scheduled");
    {
      const { error } = await sb()
        .from("game_matches")
        .insert(
          roundSchedule(block, k).map((g) => ({
            session_id: session.id,
            court: 1,
            status: "scheduled",
            game_no: g.game_no,
            block: g.block,
            label_a: g.a,
            label_b: g.b,
            team_a: [],
            team_b: [],
          })),
        );
      if (error) throw new Error(error.message);
    }
    toast.push(
      `Teams ready. Rating spread ${metrics.spread.toFixed(2)}${metrics.P ? `, ${metrics.P} position gap${metrics.P === 1 ? "" : "s"}` : ""}${block === 2 ? `, ${metrics.repeats} repeat pairs` : ""}.`,
      "success",
    );
  }

  async function swapTeams(block: 1 | 2, a: string, b: string) {
    const col = block === 1 ? "block1_team" : "block2_team";
    const ra = data.roster.find((r) => r.player_id === a)!;
    const rb = data.roster.find((r) => r.player_id === b)!;
    await updRoster(a, { [col]: teamOf(rb, block) });
    await updRoster(b, { [col]: teamOf(ra, block) });
  }

  function pick(block: 1 | 2, id: string) {
    if (!open || busy || blockStarted(block)) return;
    if (!selected || selected.block !== block) return setSelected({ block, id });
    if (selected.id === id) return setSelected(null);
    const from = selected.id;
    run(() => swapTeams(block, from, id), "Swapped");
  }

  async function moveTo(block: 1 | 2, id: string, label: string) {
    const size = data.roster.filter((r) => teamOf(r, block) === label).length;
    if (size >= 7 && !window.confirm(`Team ${label} already has ${size}. Add an eighth?`)) return;
    const { error } = await updRoster(id, { [block === 1 ? "block1_team" : "block2_team"]: label });
    if (error) throw new Error(error.message);
  }

  async function toggleTag(id: string, tag: string) {
    const cur = tagsOf(id);
    const next = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur.filter((t) => t !== "unknown"), tag];
    const { error } = await sb().from("game_sport_ratings").update({ tags: next, updated_at: new Date().toISOString() }).eq("player_id", id).eq("sport", "volleyball");
    if (error) throw new Error(error.message);
  }

  // ---------------------------------------------------------------- players
  async function seed(id: string, level: string) {
    const lv = VB_LEVELS.find((l) => l.value === level) ?? VB_LEVELS[2];
    const { error } = await sb()
      .from("game_sport_ratings")
      .upsert({ player_id: id, sport: "volleyball", level: lv.value, seed_rating: lv.seed, rating: lv.seed, seeded_at: new Date().toISOString() }, { onConflict: "player_id,sport", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  async function addToSession(id: string, level: string | null) {
    if (level) await seed(id, level);
    const { error } = await sb().from("game_session_players").upsert({ session_id: session.id, player_id: id, active: true, waiting_since: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
  async function addNew(name: string, email: string, level: string) {
    const clean = email.trim().toLowerCase() || null;
    if (clean) {
      const existing = data.master.find((p) => (p.email ?? "").toLowerCase() === clean);
      if (existing) return addToSession(existing.id, rmap.has(existing.id) ? null : level);
    }
    const { data: row, error } = await sb().from("game_players").insert({ display_name: name.trim(), email: clean }).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "A player with that email already exists. Search for them instead." : error.message);
    await addToSession(row.id, level);
  }

  // ---------------------------------------------------------------- games
  const present = (m: Match, side: "a" | "b") => {
    const label = side === "a" ? m.label_a : m.label_b;
    return data.roster.filter((r) => r.active && teamOf(r, m.block as 1 | 2) === label).map((r) => r.player_id);
  };
  const lineup = (m: Match, side: "a" | "b") => (m.status === "scheduled" ? present(m, side) : side === "a" ? m.team_a : m.team_b);

  async function start(m: Match) {
    const a = present(m, "a");
    const b = present(m, "b");
    if (a.length < 6 || b.length < 6) {
      setResult({ matchId: m.id, gameNo: m.game_no, labelA: m.label_a, labelB: m.label_b, outcome: "forfeit", winner: a.length >= b.length ? "a" : "b" });
      throw new Error(`Team ${a.length < 6 ? m.label_a : m.label_b} has fewer than 6 here. Record a forfeit (or no contest if both are short).`);
    }
    const { error } = await sb()
      .from("game_matches")
      .update({ status: "playing", started_at: new Date().toISOString(), team_a: a, team_b: b })
      .eq("id", m.id)
      .eq("status", "scheduled");
    if (error) throw new Error(error.code === "23505" ? "Another game is already on court." : error.message);
  }

  async function save(t: VbResultTarget, outcome: VbOutcome, a: number | null, b: number | null, winner: "a" | "b" | null) {
    const { error } = await sb().rpc("vb_record_result", { p_match: t.matchId, p_outcome: outcome, p_score_a: a, p_score_b: b, p_winner: winner });
    if (error) throw new Error(error.message);
    setResult(null);
  }

  async function clearResult(m: Match) {
    const { error } = await sb().rpc("vb_clear_result", { p_match: m.id });
    if (error) throw new Error(error.message);
  }

  async function finalize(noContestRest: boolean) {
    if (noContestRest)
      for (const m of matches.filter((x) => x.status !== "done")) {
        const { error } = await sb().rpc("vb_record_result", { p_match: m.id, p_outcome: "no_contest", p_score_a: null, p_score_b: null, p_winner: null });
        if (error) throw new Error(error.message);
      }
    const { error } = await sb().rpc("vb_finalize_session", { p_session: session.id });
    if (error) throw new Error(error.message);
    setFinalizing(false);
  }

  async function cancelEvent() {
    const { data: res, error } = await sb().rpc("rr_cancel_session", { p_session: session.id });
    if (error) throw new Error(error.message);
    if (res === "deleted") router.push("/dashboard/games");
  }
  async function reopen() {
    const { error } = await sb().rpc("rr_reopen_session", { p_session: session.id });
    if (error) throw new Error(error.message);
  }

  // ---------------------------------------------------------------- tonight (preview, same rules as vb_event_player)
  const blockTable = (block: number) => {
    const pts = new Map<string, { pts: number; w: number; d: number; l: number }>();
    const labels = labelsOf(block);
    labels.forEach((l) => pts.set(l, { pts: 0, w: 0, d: 0, l: 0 }));
    for (const m of done.filter((x) => x.block === block && x.outcome !== "no_contest")) {
      const A = pts.get(m.label_a)!;
      const B = pts.get(m.label_b)!;
      if (m.is_draw) {
        A.pts += 1;
        B.pts += 1;
        A.d++;
        B.d++;
      } else if (m.winner === "a") {
        A.pts += 2;
        A.w++;
        B.l++;
      } else {
        B.pts += 2;
        B.w++;
        A.l++;
      }
    }
    const rows = labels.map((l) => ({ label: l, ...pts.get(l)! })).sort((x, y) => y.pts - x.pts);
    const leader = rows[0] && rows[0].pts > 0 && rows[0].pts !== rows[1]?.pts ? rows[0].label : null;
    return { rows, leader };
  };
  const tables = { 1: blockTable(1), 2: blockTable(2) };
  const tonight = data.roster
    .map((r) => {
      const apps = done.filter((m) => m.outcome !== "no_contest" && (m.team_a.includes(r.player_id) || m.team_b.includes(r.player_id)));
      let w = 0;
      let d = 0;
      let bonus = 0;
      const blocksWon = new Set<number>();
      let rivalryDone = false;
      for (const m of apps) {
        const side = m.team_a.includes(r.player_id) ? "a" : "b";
        const won = !m.is_draw && m.winner === side;
        if (won) w++;
        if (m.is_draw) d++;
        const label = side === "a" ? m.label_a : m.label_b;
        if (tables[m.block as 1 | 2].leader === label) blocksWon.add(m.block);
        if (session.format === "rivalry" && !rivalryDone && session.rivalry_games.includes(m.game_no)) {
          rivalryDone = true;
          bonus += won ? 5 : m.is_draw ? 2.5 : 0;
        }
      }
      if (session.format === "team") bonus += 5 * blocksWon.size;
      return { id: r.player_id, n: apps.length, w, d, lp: vbLeaguePoints(apps.length, w, d, session.format, bonus) };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.lp - a.lp || b.w - a.w || b.w / b.n - a.w / a.n);

  const tokenFor = (id: string, opts: { block?: 1 | 2; size?: "sm" | "md"; onCourt?: boolean; dim?: boolean } = {}) => {
    const r = rating(id);
    return (
      <div className={cn(opts.dim && "opacity-40")}>
        <PlayerToken
          name={nameOf(id)}
          rating={r}
          tier={DIV_STYLE[vbDivision(r)]}
          provisional={provisional(id)}
          size={opts.size ?? "sm"}
          onCourt={opts.onCourt}
          selected={!!opts.block && selected?.block === opts.block && selected.id === id}
          disabled={!opts.block || !open || busy || blockStarted(opts.block)}
          onSelect={opts.block ? () => pick(opts.block!, id) : undefined}
        />
      </div>
    );
  };

  const checkedIn = checkedInCount;

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/games" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Sessions
        </Link>
        <h1 className="font-serif font-bold text-2xl text-ink">
          {session.title ?? "Volleyball"}
          {session.events?.name ? <span className="font-sans font-normal text-base text-inkSoft"> · {session.events.name}</span> : null}
        </h1>
        <span className="rounded-full bg-[#B4471D] text-white px-2.5 py-0.5 text-xs font-bold">Spike &amp; Chill · {formatLabel(session.format)}</span>
        <span className="rounded-full bg-cream ring-1 ring-border px-2.5 py-0.5 text-xs text-inkSoft">
          Play to 21 · LP = {session.format === "double" ? "2 × " : ""}(20 + 80 × win rate), max 100
        </span>
        <div className="ml-auto flex items-center gap-2">
          {open ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const msg = done.length
                  ? `Cancel this event? All ${done.length} result${done.length === 1 ? "" : "s"} will be voided and nothing counts.`
                  : "Cancel this event? Nothing has been played, so it will be deleted.";
                if (window.confirm(msg)) run(cancelEvent, done.length ? "Event cancelled" : "Event deleted");
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Cancel event
            </button>
          ) : null}
          {session.status === "finalized" ? (
            <>
              <span className="text-xs font-semibold rounded-full bg-greenBg text-green px-2.5 py-1">Finalized · LP counts toward the season</span>
              {["owner", "partner"].includes(data.role) ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => window.confirm("Reopen this event to correct results?") && run(reopen, "Event reopened")}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reopen
                </Button>
              ) : null}
            </>
          ) : session.status === "cancelled" ? (
            <span className="text-xs font-semibold rounded-full bg-salmonBg text-coral px-2.5 py-1">Cancelled · nothing counts</span>
          ) : open && matches.length ? (
            <Button onClick={() => setFinalizing(true)} disabled={busy}>
              <Flag className="w-4 h-4" /> Finalize event
            </Button>
          ) : null}
        </div>
      </div>

      {/* Teams */}
      <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif font-bold text-lg text-ink flex items-center gap-2">
            <Users className="w-5 h-5 text-[#B4471D]" /> Teams
          </h2>
          <div className="flex gap-1 rounded-full bg-cream p-1">
            {([1, 2] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setTab(b)}
                className={cn("rounded-full px-3 py-1 text-xs font-bold", tab === b ? "bg-white text-ink shadow-card" : "text-inkSoft hover:text-ink")}
              >
                Round {b} · games {b === 1 ? "1-6" : "7-12"}
              </button>
            ))}
          </div>
          <span className="text-xs text-inkSoft">
            {checkedIn} here{tab === 2 ? " · round 2 reshuffles everyone, fewest repeat teammates" : ""}
          </span>
          {open && !blockStarted(tab) && (tab === 1 || hasBlock(1)) ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* How many teams: suggested from who's here, any option with 6+ per team. */}
              <div className="flex gap-1 rounded-full bg-cream p-1">
                {[2, 3, 4].map((k) => {
                  const fits = teamsFit(checkedIn, k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!fits || busy}
                      title={fits ? `Teams of ${teamSizes(checkedIn, k).join(", ")}` : `Needs ${k * 6}+ players`}
                      onClick={() => setTeamPick((x) => ({ ...x, [tab]: k }))}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-bold transition disabled:opacity-30",
                        teamsFor(tab) === k ? "bg-white text-ink shadow-card" : "text-inkSoft hover:text-ink",
                      )}
                    >
                      {k} teams{fits ? ` · ${teamSizes(checkedIn, k)[0]}${teamSizes(checkedIn, k)[k - 1] !== teamSizes(checkedIn, k)[0] ? `/${teamSizes(checkedIn, k)[k - 1]}` : ""}` : ""}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={busy || !teamsFit(checkedIn, teamsFor(tab))}
                onClick={() => (!hasBlock(tab) || window.confirm(`Regenerate round ${tab} teams?`)) && run(() => generate(tab, teamsFor(tab)))}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
              >
                <Shuffle className="w-3.5 h-3.5" /> {hasBlock(tab) ? `Regenerate round ${tab}` : `Generate round ${tab} teams`}
              </button>
            </div>
          ) : null}
        </div>
        {open && !blockStarted(tab) && checkedIn < 12 ? (
          <p className="mt-2 text-xs text-coral">At least 12 players are needed for two teams of 6.</p>
        ) : null}

        {!hasBlock(tab) ? (
          <p className="mt-3 text-sm text-inkSoft">
            {tab === 1
              ? "Check everyone in below (with a level and positions), then generate balanced teams. 24+ players makes 4 teams, 18 to 23 makes 3, 12 to 17 makes 2."
              : "Generate round 2 near the end of game 6. Everyone is reshuffled into new balanced teams."}
          </p>
        ) : (
          <div className={cn("mt-3 grid gap-3 md:grid-cols-2", labelsOf(tab).length === 4 ? "xl:grid-cols-4" : labelsOf(tab).length === 3 ? "xl:grid-cols-3" : "")}>
            {labelsOf(tab).map((label) => {
              const members = data.roster.filter((r) => teamOf(r, tab) === label);
              const ps = members.map((r) => ({ id: r.player_id, rating: rating(r.player_id), tags: tagsOf(r.player_id) }));
              const def = deficits(ps);
              const avg = ps.length ? ps.reduce((s, p) => s + p.rating, 0) / ps.length : 0;
              const row = tables[tab].rows.find((x) => x.label === label);
              return (
                <div key={label} className={cn("rounded-2xl ring-1 p-3", TEAM_STYLE[label])}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-serif text-lg font-bold text-ink">Team {label}</span>
                    <span className="text-xs text-inkSoft tabular-nums">
                      {members.length} · avg {avg.toFixed(2)}
                      {row && row.w + row.d + row.l > 0 ? ` · ${row.w}W ${row.d ? `${row.d}D ` : ""}${row.l}L` : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold">
                    {[
                      ["Setter", def.setter],
                      ["2 middles", def.middle],
                      ["2 outside/opp", def.wing],
                      ["2 defensive", def.defensive],
                    ].map(([l, n]) => (
                      <span key={l as string} className={cn("rounded-full px-1.5 py-0.5", n ? "bg-salmonBg text-coral" : "bg-white/70 text-green")}>
                        {n ? `Short: ${l}` : `✓ ${l}`}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {members.map((r) => (
                      <React.Fragment key={r.player_id}>{tokenFor(r.player_id, { block: tab, dim: !r.active })}</React.Fragment>
                    ))}
                  </div>
                  {selected && selected.block === tab && !blockStarted(tab) && teamOf(data.roster.find((r) => r.player_id === selected.id)!, tab) !== label ? (
                    <button
                      type="button"
                      onClick={() => {
                        const id = selected.id;
                        run(() => moveTo(tab, id, label), `Moved to team ${label}`);
                      }}
                      className="mt-2 w-full rounded-full border border-dashed border-ink/30 py-1 text-xs font-semibold text-ink hover:bg-white/60"
                    >
                      Move here
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {hasBlock(tab) && data.roster.some((r) => r.active && !teamOf(r, tab)) ? (
          <div className="mt-3 rounded-2xl bg-cream/70 px-3 py-2">
            <div className="text-xs font-bold uppercase tracking-smallcaps text-inkSoft">No team yet (late arrivals)</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {data.roster
                .filter((r) => r.active && !teamOf(r, tab))
                .map((r) => (
                  <React.Fragment key={r.player_id}>{tokenFor(r.player_id, { block: tab })}</React.Fragment>
                ))}
            </div>
            <p className="mt-1 text-xs text-inkSoft">Tap a player, then Move here on a team.</p>
          </div>
        ) : null}
        {hasBlock(tab) && open && !blockStarted(tab) ? <p className="mt-2 text-xs text-inkSoft">Tap two players to swap them. Teams lock when the round&apos;s first game starts.</p> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5 min-w-0">
          {/* Current game */}
          {current ? (
            <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-lg font-bold text-ink">
                  Game {current.game_no} · Team {current.label_a} vs Team {current.label_b}
                </span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", current.status === "playing" ? "bg-greenBg text-green" : "bg-cream text-inkSoft")}>
                  {current.status === "playing" ? "On court" : "Up next"}
                </span>
                {nextUp ? (
                  <span className="ml-auto text-xs text-inkSoft">
                    Then game {nextUp.game_no}: {nextUp.label_a} vs {nextUp.label_b}
                  </span>
                ) : null}
              </div>
              {current.block === 2 && !hasBlock(2) ? (
                <div className="mt-4 rounded-2xl bg-yellowBg px-4 py-3 text-sm text-[#854F0B]">Round 2 needs new teams. Generate them in the Teams panel (Round 2 tab).</div>
              ) : (
                <>
                  <div className="relative mx-auto mt-3 aspect-square w-full max-w-[520px] overflow-hidden rounded-2xl">
                    <CourtArt sport="volleyball" />
                    <div className="absolute inset-0 grid grid-rows-2">
                      {(["a", "b"] as const).map((side) => {
                        const ids = lineup(current, side);
                        const label = side === "a" ? current.label_a : current.label_b;
                        return (
                          <div key={side} className={cn("flex items-center justify-center gap-2 px-3 py-4", side === "a" ? "flex-col" : "flex-col-reverse")}>
                            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold text-ink">
                              Team {label} · {ids.length} here
                            </span>
                            <div className="flex max-w-[95%] flex-wrap justify-center gap-1">
                              {ids.map((id) => (
                                <React.Fragment key={id}>{tokenFor(id, { onCourt: true })}</React.Fragment>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {open ? (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {current.status === "scheduled" ? (
                        <Button onClick={() => run(() => start(current), `Game ${current.game_no} on court`)} disabled={busy}>
                          <Play className="w-4 h-4" /> Start game {current.game_no}
                        </Button>
                      ) : (
                        <>
                          <Button onClick={() => setResult({ matchId: current.id, gameNo: current.game_no, labelA: current.label_a, labelB: current.label_b })} disabled={busy}>
                            Enter result
                          </Button>
                          <Button variant="ghost" onClick={() => run(() => clearResult(current), "Game back to not started")} disabled={busy}>
                            <Undo2 className="w-4 h-4" /> Not started
                          </Button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setResult({ matchId: current.id, gameNo: current.game_no, labelA: current.label_a, labelB: current.label_b, outcome: "forfeit" })}
                        className="text-xs text-inkSoft underline underline-offset-4 hover:text-ink"
                      >
                        Forfeit or no contest
                      </button>
                    </div>
                  ) : null}
                  <p className="mt-2 text-center text-xs text-inkSoft">6 on court, everyone else rotates in. At every side out both teams swap the P1 player with their next sub.</p>
                </>
              )}
            </section>
          ) : needRound2 ? (
            <section className="rounded-3xl bg-yellowBg p-5 text-sm text-[#854F0B]">
              Round 1 is done. Open the Round 2 tab in Teams and generate new teams to schedule games 7 to 12 (or finalize now).
            </section>
          ) : matches.length ? (
            <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-5 text-sm text-inkSoft">Every game has a result. Finalize the event to post LP.</section>
          ) : null}

          {/* Schedule */}
          {matches.length ? (
            <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
              <h2 className="font-serif font-bold text-lg text-ink">Schedule</h2>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                {[1, 2].map((block) => (
                  <ol key={block} className="space-y-1.5">
                    <li className="text-xs font-bold text-inkSoft">
                      Round {block}
                      {labelsOf(block).length ? ` · teams ${labelsOf(block).join(", ")}` : ""}
                    </li>
                    {!matches.some((m) => m.block === block) ? (
                      <li className="rounded-xl bg-cream/60 px-3 py-3 text-xs text-inkSoft">Games {block === 1 ? "1 to 6" : "7 to 12"} appear when round {block} teams are made.</li>
                    ) : null}
                    {matches
                      .filter((m) => m.block === block)
                      .map((m) => {
                        const rest = labelsOf(m.block).filter((l) => l !== m.label_a && l !== m.label_b);
                        const res =
                          m.status !== "done"
                            ? null
                            : m.outcome === "forfeit"
                              ? `Forfeit, ${m.winner === "a" ? m.label_a : m.label_b} wins`
                              : m.outcome === "no_contest"
                                ? "No contest"
                                : `${m.score_a}-${m.score_b}${m.outcome === "timed" ? " (time)" : ""}${m.is_draw ? " draw" : ""}`;
                        return (
                          <li
                            key={m.id}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm ring-1",
                              m.id === current?.id ? "bg-ink text-white ring-ink" : m.status === "done" ? "bg-cream/60 text-ink ring-transparent" : "bg-white text-ink ring-border",
                            )}
                          >
                            <span className="w-6 font-bold tabular-nums opacity-70">{m.game_no}</span>
                            <span className="font-semibold">
                              <span className={cn(m.status === "done" && !m.is_draw && m.winner === "a" && "underline decoration-2 underline-offset-4")}>{m.label_a}</span> vs{" "}
                              <span className={cn(m.status === "done" && !m.is_draw && m.winner === "b" && "underline decoration-2 underline-offset-4")}>{m.label_b}</span>
                            </span>
                            {rest.length ? <span className="text-xs opacity-60">rest {rest.join(", ")}</span> : null}
                            <span className="ml-auto text-xs font-semibold tabular-nums">{res ?? (m.status === "playing" ? "On court" : "")}</span>
                            {m.status === "done" && open ? (
                              <span className="flex gap-1.5">
                                <button
                                  type="button"
                                  aria-label="Edit result"
                                  onClick={() =>
                                    setResult({ matchId: m.id, gameNo: m.game_no, labelA: m.label_a, labelB: m.label_b, outcome: m.outcome, scoreA: m.score_a, scoreB: m.score_b, winner: m.winner })
                                  }
                                  className="opacity-60 hover:opacity-100"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Clear result"
                                  onClick={() => window.confirm(`Clear game ${m.game_no}'s result? Ratings are recalculated.`) && run(() => clearResult(m), "Result cleared")}
                                  className="opacity-60 hover:opacity-100"
                                >
                                  <Undo2 className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                  </ol>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {open ? (
            <AddPlayers
              master={data.master}
              passes={data.passes}
              inSession={new Set(data.roster.map((r) => r.player_id))}
              hasEvent={!!session.event_id}
              busy={busy}
              levels={VB_LEVELS}
              isSeeded={(p) => rmap.has(p.id)}
              ratingOf={(p) => rating(p.id)}
              onAdd={(id, level) => run(() => addToSession(id, level))}
              onCreate={(n, e, l) => run(() => addNew(n, e, l), `${n} added`)}
            />
          ) : null}
          <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-bold text-lg text-ink">Players</h2>
              <span className="text-xs text-inkSoft">{checkedIn} here · newest first · tap positions</span>
            </div>
            {data.roster.length === 0 ? (
              <p className="mt-2 text-sm text-inkSoft">No one checked in yet. Add players below.</p>
            ) : (
              <ul className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {[...data.roster]
                  // Newest first, so a player just added is right there to tag.
                  .sort((a, b) => b.joined_at.localeCompare(a.joined_at) || nameOf(a.player_id).localeCompare(nameOf(b.player_id)))
                  .map((r) => {
                    const tags = tagsOf(r.player_id);
                    return (
                      <li key={r.player_id} className={cn("rounded-xl px-2 py-1.5", r.active ? "bg-cream/50" : "bg-cream/20 opacity-60")}>
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{nameOf(r.player_id)}</span>
                          <span
                            className="rounded-full px-1.5 text-[10px] font-bold leading-4 tabular-nums"
                            style={{ background: DIV_STYLE[vbDivision(rating(r.player_id))].bg, color: DIV_STYLE[vbDivision(rating(r.player_id))].fg }}
                            title={DIV_STYLE[vbDivision(rating(r.player_id))].label}
                          >
                            {rating(r.player_id).toFixed(3)}
                            {provisional(r.player_id) ? " P" : ""}
                          </span>
                          {open ? (
                            <button
                              type="button"
                              title={r.active ? "Mark away" : "Mark here"}
                              disabled={busy}
                              onClick={() => run(async () => { const { error } = await updRoster(r.player_id, { active: !r.active }); if (error) throw new Error(error.message); })}
                              className="text-inkSoft hover:text-ink"
                            >
                              <Coffee className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {VB_TAGS.map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              title={t.label}
                              disabled={!open || busy}
                              onClick={() => run(() => toggleTag(r.player_id, t.value))}
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-bold transition",
                                tags.includes(t.value) ? "bg-ink text-white" : "bg-white text-inkSoft ring-1 ring-border hover:text-ink",
                              )}
                            >
                              {t.short}
                            </button>
                          ))}
                          {tags.length === 0 ? <span className="text-[10px] text-coral">positions unknown</span> : null}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-inkSoft">S setter · M middle · OH outside · OP opposite · D defensive. P = provisional (first 5 games).</p>
          </section>


          <section className="rounded-3xl bg-white ring-1 ring-border shadow-card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-bold text-lg text-ink">Tonight</h2>
              <span className="text-xs text-inkSoft">{session.status === "finalized" ? "Final LP" : "LP preview"}</span>
            </div>
            {[1, 2].map((b) =>
              tables[b as 1 | 2].rows.some((r) => r.w + r.d + r.l > 0) ? (
                <div key={b} className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="font-semibold text-inkSoft">Round {b}:</span>
                  {tables[b as 1 | 2].rows.map((r) => (
                    <span key={r.label} className={cn("rounded-full px-2 py-0.5 tabular-nums", tables[b as 1 | 2].leader === r.label ? "bg-ink text-white" : "bg-cream text-ink")}>
                      {r.label} {r.pts}
                    </span>
                  ))}
                </div>
              ) : null,
            )}
            {tonight.length === 0 ? (
              <p className="mt-2 text-sm text-inkSoft">Standings appear after the first result.</p>
            ) : (
              <ol className="mt-2 divide-y divide-border text-sm">
                {tonight.slice(0, 14).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 py-1.5">
                    <span className={cn("w-5 text-center font-bold tabular-nums", i === 0 ? "text-[#BA7517]" : "text-inkSoft")}>{i + 1}</span>
                    <span className="flex-1 truncate text-ink">{shortName(nameOf(t.id))}</span>
                    <span className="text-xs text-inkSoft tabular-nums">
                      {t.w}W {t.d ? `${t.d}D ` : ""}
                      {t.n - t.w - t.d}L
                    </span>
                    <span className="w-14 text-right font-semibold tabular-nums text-ink">{t.lp.toFixed(2)}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-2 text-[11px] text-inkSoft">
              {session.format === "team"
                ? "Team Night: +5 LP for each round your team wins outright (2 per win, 1 per draw)."
                : session.format === "rivalry"
                  ? `Rivalry games: ${session.rivalry_games.join(" and ")}. +5 for a win, +2.5 for a draw.`
                  : session.format === "double"
                    ? "Double Points: LP doubled, still capped at 100."
                    : "LP is capped at 100 per event."}
            </p>
          </section>
        </div>
      </div>

      <VolleyResultModal
        target={result}
        busy={busy}
        onClose={() => setResult(null)}
        onSave={(o, a, b, w) => {
          const t = result;
          if (t) run(() => save(t, o, a, b, w), "Result saved");
        }}
      />

      {finalizing ? (
        <Modal
          open
          onClose={() => setFinalizing(false)}
          title="Finalize event"
          description="Locks tonight's results and posts LP to the season leaderboard."
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setFinalizing(false)}>
                Not yet
              </Button>
              {matches.some((m) => m.status !== "done") ? (
                <Button
                  variant="dangerGhost"
                  disabled={busy || matches.some((m) => m.status === "playing")}
                  onClick={() => window.confirm("Mark every game without a result as no contest, then finalize?") && run(() => finalize(true), "Event finalized")}
                >
                  No contest the rest + finalize
                </Button>
              ) : (
                <Button onClick={() => run(() => finalize(false), "Event finalized")} disabled={busy}>
                  <Flag className="w-4 h-4" /> Finalize
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            {matches.some((m) => m.status === "playing") ? <p className="rounded-lg bg-salmonBg px-3 py-2 text-coral">A game is still on court. Enter its result first.</p> : null}
            <p className="text-inkSoft">
              {done.length} of {matches.length} games have a result. {tonight.length} players earn LP.
            </p>
            <ol className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg ring-1 ring-border">
              {tonight.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-1.5">
                  <span className="w-5 text-inkSoft tabular-nums">{i + 1}</span>
                  <span className="flex-1 text-ink">{nameOf(t.id)}</span>
                  <span className="text-xs text-inkSoft tabular-nums">
                    {t.n} games · {t.w}W {t.d}D
                  </span>
                  <span className="w-14 text-right font-semibold tabular-nums">{t.lp.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
