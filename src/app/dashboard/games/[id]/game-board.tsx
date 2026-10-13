"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pause, Play, Plus, Search, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  balanceTeams,
  minutesSince,
  nextUp,
  partnerCounts,
  ratingDeltas,
  SKILL_RATING,
  SPORTS,
  type Skill,
} from "../logic";

type Player = { id: string; display_name: string; email: string | null; rating: number; skill_level: Skill };
type Match = {
  id: string;
  court: number;
  team_a: string[];
  team_b: string[];
  score_a: number | null;
  score_b: number | null;
  winner: "a" | "b" | null;
  status: "playing" | "done";
  started_at: string;
  finished_at: string | null;
};
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
  roster: Array<{ player_id: string; active: boolean; waiting_since: string; joined_at: string; game_players: Player }>;
  matches: Match[];
  master: Player[];
  passes: Array<{ id: string; holder_name: string | null; buyer_email: string | null; ticket_type_name: string; checked_in_at: string }>;
};

export function GameBoard({ data }: { data: BoardData }) {
  const router = useRouter();
  const toast = useToast();
  const { session } = data;
  const sport = SPORTS.find((s) => s.value === session.sport);
  const open = session.status === "open";
  const [busy, setBusy] = React.useState(false);
  const [autoFill, setAutoFill] = React.useState(true);
  const [scoring, setScoring] = React.useState<Match | null>(null);
  const [, tick] = React.useState(0);

  // Re-render every 30s so wait times stay current.
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

  const live = data.matches.filter((m) => m.status === "playing");
  const done = data.matches.filter((m) => m.status === "done");
  const onCourt = new Set(live.flatMap((m) => [...m.team_a, ...m.team_b]));
  const gamesTonight = (id: string) => done.filter((m) => m.team_a.includes(id) || m.team_b.includes(id)).length;

  const waiting = data.roster
    .filter((r) => r.active && !onCourt.has(r.player_id))
    .map((r) => ({ id: r.player_id, rating: Number(r.game_players.rating), waiting_since: r.waiting_since }))
    .sort((a, b) => a.waiting_since.localeCompare(b.waiting_since));
  const benched = data.roster.filter((r) => !r.active);
  const need = session.team_size * 2;
  const name = (id: string) => byId.get(id)?.display_name ?? "Unknown";

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (ok) toast.push(ok, "success");
    } catch (e) {
      toast.push((e as Error).message, "error");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function startCourt(court: number, queue = waiting, history = done) {
    const players = nextUp(queue, session.team_size);
    if (!players) throw new Error(`Need ${need} players waiting to start a game.`);
    const [a, b] = balanceTeams(players, partnerCounts(history));
    const { error } = await createClient()
      .from("game_matches")
      .insert({ session_id: session.id, court, team_a: a.map((p) => p.id), team_b: b.map((p) => p.id) });
    if (error) throw new Error(error.code === "23505" ? `Court ${court} already has a game on.` : error.message);
  }

  async function finish(m: Match, sa: number, sb: number) {
    if (sa === sb) throw new Error("Scores can't be tied. Enter the final score.");
    const supabase = createClient();
    const winner = sa > sb ? "a" : "b";
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("game_matches")
      .update({ score_a: sa, score_b: sb, winner, status: "done", finished_at: now })
      .eq("id", m.id)
      .eq("status", "playing");
    if (error) throw new Error(error.message);
    // Everyone who just played goes to the back of the queue.
    const ids = [...m.team_a, ...m.team_b];
    const { error: qErr } = await supabase
      .from("game_session_players")
      .update({ waiting_since: now })
      .eq("session_id", session.id)
      .in("player_id", ids);
    if (qErr) throw new Error(qErr.message);
    // Nudge ratings (used only to make fair teams).
    const P = (id: string) => ({ id, rating: Number(byId.get(id)?.rating ?? 3.5), waiting_since: now });
    for (const r of ratingDeltas(m.team_a.map(P), m.team_b.map(P), winner === "a")) {
      await supabase.from("game_players").update({ rating: r.rating, updated_at: now }).eq("id", r.id);
    }
    if (autoFill && open) {
      const activeIds = new Set(data.roster.filter((r) => r.active).map((r) => r.player_id));
      const nextQueue = [
        ...waiting,
        ...ids.filter((id) => activeIds.has(id)).map((id) => ({ id, rating: Number(byId.get(id)?.rating ?? 3.5), waiting_since: now })),
      ];
      if (nextQueue.length >= need) {
        await startCourt(m.court, nextQueue, [...done, { ...m, team_a: m.team_a, team_b: m.team_b }]);
      }
    }
  }

  async function voidMatch(m: Match) {
    const { error } = await createClient().from("game_matches").update({ status: "void", finished_at: new Date().toISOString() }).eq("id", m.id);
    if (error) throw new Error(error.message);
  }

  async function setActive(playerId: string, active: boolean) {
    const patch: Record<string, unknown> = { active };
    if (active) patch.waiting_since = new Date().toISOString();
    const { error } = await createClient()
      .from("game_session_players")
      .update(patch)
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
    const supabase = createClient();
    const clean = email.trim().toLowerCase() || null;
    if (clean) {
      const existing = data.master.find((p) => (p.email ?? "").toLowerCase() === clean);
      if (existing) return addToSession(existing.id);
    }
    const { data: row, error } = await supabase
      .from("game_players")
      .insert({ display_name: displayName.trim(), email: clean, skill_level: skill, rating: SKILL_RATING[skill] })
      .select("id")
      .single();
    if (error) throw new Error(error.code === "23505" ? "A player with that email already exists. Search for them instead." : error.message);
    await addToSession(row.id);
  }

  async function closeSession() {
    const { error } = await createClient()
      .from("game_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", session.id);
    if (error) throw new Error(error.message);
  }

  // Tonight's mini standings (same points rule as the leaderboard).
  const tonight = data.roster
    .map((r) => {
      const games = done.filter((m) => m.team_a.includes(r.player_id) || m.team_b.includes(r.player_id));
      const wins = games.filter((m) => (m.winner === "a" ? m.team_a : m.team_b).includes(r.player_id)).length;
      return { id: r.player_id, wins, games: games.length, pts: games.length ? wins * 3 + (games.length - wins) + 2 : 0 };
    })
    .filter((x) => x.games > 0)
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/games" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink">
          <ArrowLeft className="w-4 h-4" /> Game Day
        </Link>
        <h1 className="font-serif font-bold text-2xl text-ink">
          {sport?.label ?? session.sport}
          {session.events?.name ? <span className="font-sans font-normal text-base text-inkSoft"> · {session.events.name}</span> : null}
        </h1>
        <span className="text-xs text-inkSoft">
          {session.courts} courts · {session.team_size} a side · Win 3 · Loss 1 · +2 for playing
        </span>
        <div className="ml-auto flex items-center gap-3">
          {open ? (
            <>
              <label className="text-sm text-ink flex items-center gap-2 select-none cursor-pointer">
                <input type="checkbox" checked={autoFill} onChange={(e) => setAutoFill(e.target.checked)} />
                Auto-start next game
              </label>
              <Button variant="ghost" onClick={() => run(closeSession, "Session closed")} disabled={busy || live.length > 0}>
                Close session
              </Button>
            </>
          ) : (
            <span className="text-xs font-semibold rounded-full bg-cream text-inkSoft px-2 py-0.5">Closed</span>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        {/* Courts */}
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: session.courts }, (_, i) => i + 1).map((court) => {
            const m = live.find((x) => x.court === court);
            return (
              <div key={court} className={cn("rounded-lg border shadow-card p-4", m ? "bg-white border-border" : "bg-cream/60 border-dashed border-border")}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-smallcaps text-inkSoft">Court {court}</span>
                  {m ? <span className="text-xs text-inkSoft">{minutesSince(m.started_at)} min</span> : null}
                </div>
                {m ? (
                  <>
                    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <TeamList ids={m.team_a} name={name} />
                      <span className="text-xs font-semibold text-inkSoft">vs</span>
                      <TeamList ids={m.team_b} name={name} align="right" />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => setScoring(m)} disabled={busy || !open} className="flex-1">
                        Enter score
                      </Button>
                      <Button variant="ghost" onClick={() => run(() => voidMatch(m), "Game cancelled")} disabled={busy || !open} title="Cancel this game">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-6 mb-2 text-center">
                    {open ? (
                      waiting.length >= need ? (
                        <Button onClick={() => run(() => startCourt(court), `Game on court ${court}`)} disabled={busy}>
                          <Play className="w-4 h-4" /> Start next game
                        </Button>
                      ) : (
                        <p className="text-sm text-inkSoft">Need {need - waiting.length} more waiting</p>
                      )
                    ) : (
                      <p className="text-sm text-inkSoft">Court free</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Tonight */}
          <div className="md:col-span-2 rounded-lg border border-border bg-white shadow-card">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold text-ink">Tonight · {done.length} games played</div>
            {tonight.length === 0 ? (
              <p className="px-4 py-5 text-sm text-inkSoft">Standings appear after the first game.</p>
            ) : (
              <ol className="divide-y divide-border text-sm">
                {tonight.slice(0, 12).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-5 text-inkSoft tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-ink">{name(t.id)}</span>
                    <span className="text-inkSoft tabular-nums">
                      {t.wins}–{t.games - t.wins}
                    </span>
                    <span className="w-12 text-right font-semibold tabular-nums text-ink">{t.pts} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Queue + roster */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-white shadow-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-ink">Queue · {waiting.length} waiting</span>
              <span className="text-xs text-inkSoft">longest wait plays next</span>
            </div>
            {waiting.length === 0 ? (
              <p className="px-4 py-5 text-sm text-inkSoft">No one waiting. Add players below.</p>
            ) : (
              <ol className="divide-y divide-border">
                {waiting.map((w, i) => (
                  <li key={w.id} className={cn("flex items-center gap-3 px-4 py-2 text-sm", i < need && "bg-greenBg/50")}>
                    <span className="w-5 text-inkSoft tabular-nums">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate text-ink">{name(w.id)}</span>
                    <span className="text-xs text-inkSoft tabular-nums">
                      {minutesSince(w.waiting_since)}m · {gamesTonight(w.id)}g
                    </span>
                    {open ? (
                      <button
                        type="button"
                        onClick={() => run(() => setActive(w.id, false))}
                        className="p-1 rounded text-inkSoft hover:bg-cream hover:text-ink"
                        title="Bench (taking a break / gone home)"
                        aria-label={`Bench ${name(w.id)}`}
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {benched.length ? (
              <div className="border-t border-border px-4 py-3">
                <p className="text-xs font-semibold text-inkSoft">On a break</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {benched.map((b) => (
                    <button
                      key={b.player_id}
                      type="button"
                      disabled={!open || busy}
                      onClick={() => run(() => setActive(b.player_id, true))}
                      className="rounded-full bg-cream ring-1 ring-border px-2.5 py-1 text-xs text-ink hover:ring-berry/40"
                      title="Back in the queue"
                    >
                      {b.game_players.display_name} ↩
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {open ? (
            <AddPlayers data={data} busy={busy} onAdd={(id) => run(() => addToSession(id))} onCreate={(n, e, s) => run(() => addNewPlayer(n, e, s), `${n} added`)} />
          ) : null}
        </div>
      </div>

      {scoring ? (
        <ScoreModal
          match={scoring}
          name={name}
          busy={busy}
          onCancel={() => setScoring(null)}
          onSave={(a, b) =>
            run(async () => {
              await finish(scoring, a, b);
              setScoring(null);
            }, "Score saved")
          }
        />
      ) : null}
    </div>
  );
}

function TeamList({ ids, name, align = "left" }: { ids: string[]; name: (id: string) => string; align?: "left" | "right" }) {
  return (
    <ul className={cn("space-y-0.5 text-sm font-semibold text-ink", align === "right" && "text-right")}>
      {ids.map((id) => (
        <li key={id} className="truncate">
          {name(id)}
        </li>
      ))}
    </ul>
  );
}

function ScoreModal({
  match,
  name,
  busy,
  onCancel,
  onSave,
}: {
  match: Match;
  name: (id: string) => string;
  busy: boolean;
  onCancel: () => void;
  onSave: (a: number, b: number) => void;
}) {
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  function save() {
    const na = Number(a);
    const nb = Number(b);
    if (a === "" || b === "" || !Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0) return setErr("Enter both scores.");
    if (na === nb) return setErr("Scores can't be tied.");
    onSave(na, nb);
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      title={`Court ${match.court} · final score`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save score"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {(["a", "b"] as const).map((side) => (
          <div key={side} className="space-y-2">
            <p className="text-sm font-semibold text-ink">{(side === "a" ? match.team_a : match.team_b).map(name).join(" + ")}</p>
            <NumberInput
              min="0"
              step="1"
              autoFocus={side === "a"}
              value={side === "a" ? a : b}
              onChange={(e) => (side === "a" ? setA(e.target.value) : setB(e.target.value))}
              aria-label={`Score for ${side === "a" ? "team A" : "team B"}`}
            />
          </div>
        ))}
      </div>
      {err ? <p className="mt-3 text-sm text-coral">{err}</p> : null}
    </Modal>
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

  // Checked-in pass holders not yet on tonight's roster.
  const passList = data.passes
    .map((t) => ({ ...t, player: t.buyer_email ? byEmail.get(t.buyer_email.toLowerCase()) : undefined }))
    .filter((t) => !t.player || !inSession.has(t.player.id));
  const results = data.master
    .filter((p) => !inSession.has(p.id))
    .filter((p) => !q.trim() || `${p.display_name} ${p.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 12);

  return (
    <div className="rounded-lg border border-border bg-white shadow-card">
      <div className="flex border-b border-border text-sm">
        {(
          [
            ["passes", `Checked in (${passList.length})`],
            ["search", "Past players"],
            ["new", "New"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("flex-1 px-3 py-2.5 font-semibold border-b-2 -mb-px", tab === k ? "text-berry border-berry" : "text-inkSoft border-transparent")}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "passes" ? (
        passList.length === 0 ? (
          <p className="px-4 py-5 text-sm text-inkSoft">
            {data.session.event_id ? "Everyone checked in is already on the roster." : "This session isn't linked to an event."}
          </p>
        ) : (
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
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
          <ul className="divide-y divide-border max-h-72 overflow-y-auto">
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
    </div>
  );
}
