// Game-day matchmaking + Rally & Rank maths (pure functions, unit-testable).
// Rules: docs/specs/RALLY_AND_RANK_2_SPEC.txt. The database is the source of
// truth for ratings and LP (rr_* functions and views); these mirror it for the
// live board.

export type Sport = "badminton" | "pickleball" | "volleyball";
export const SPORTS: Array<{ value: Sport; label: string; teamSize: number | null }> = [
  { value: "badminton", label: "Badminton", teamSize: 2 },
  { value: "pickleball", label: "Pickleball", teamSize: 2 },
  { value: "volleyball", label: "Volleyball", teamSize: null }, // 4–6, chosen per session
];

export type Format = "classic" | "team" | "double" | "rivalry";
export const FORMATS: Array<{ value: Format; label: string; blurb: string; ready: boolean }> = [
  { value: "classic", label: "Classic", blurb: "Rotating partners. LP up to 100.", ready: true },
  { value: "team", label: "Team", blurb: "Three squads, A v B, B v C, C v A. Top squad +10, second +5.", ready: true },
  { value: "double", label: "Double Points", blurb: "Classic rules, LP doubled (up to 200).", ready: true },
  { value: "rivalry", label: "Rivalry", blurb: "Fixed pairs and a bracket. Coming in December.", ready: false },
];
export const formatLabel = (f: string | null | undefined) => FORMATS.find((x) => x.value === f)?.label ?? "Casual";

/** Monthly rotation: wk1 Classic, wk2 Team, wk3 Classic, wk4 special (Double Points Nov 2026, then alternating with Rivalry). */
export function suggestedFormat(isoDate: string): Format | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  const week = Math.ceil(d / 7);
  if (week === 1 || week === 3) return "classic";
  if (week === 2) return "team";
  if (week === 4) return ((y - 2026) * 12 + (m - 11)) % 2 === 0 ? "double" : "rivalry";
  return null; // fifth week: no ranked event by default
}

// Levels are staff-only. Picking one sets the starting rating (centre of the range).
export const SKILL_RATING = { beginner: 1.5, intermediate: 2.6, advanced: 3.85, pro: 5.25 } as const;
export type Skill = keyof typeof SKILL_RATING;
export const SKILLS: Array<{ value: Skill; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "pro", label: "Pro" },
];

/** Division from the stored rating (full precision, no rounding first). */
export function tierOf(rating: number): Skill {
  return rating < 2 ? "beginner" : rating < 3.2 ? "intermediate" : rating < 4.5 ? "advanced" : "pro";
}

// ---------------------------------------------------------------- scores
/** Badminton: 21, win by 2, cap 30. "Timed" = time called, any lead counts. */
export function validScore(winner: number, loser: number, finish: "target" | "timed"): boolean {
  if (!Number.isInteger(winner) || !Number.isInteger(loser) || loser < 0 || winner <= loser || winner > 30) return false;
  if (finish === "timed") return true;
  return (winner === 21 && loser <= 19) || (winner >= 22 && winner <= 30 && loser === winner - 2) || (winner === 30 && loser === 29);
}

// ---------------------------------------------------------------- league points
export function placementBonus(format: string | null, place: number | null) {
  if (format === "team") return place === 1 ? 10 : place === 2 ? 5 : 0;
  if (format === "rivalry") return place === 1 ? 20 : place === 2 ? 10 : 0;
  return 0;
}

/** LP = q × [M × (20 + 80 × W/N) + B], q = min(1, N/4), rounded half up to 2 dp. */
export function leaguePoints(n: number, w: number, format: string | null, bonus = 0): number {
  if (n <= 0) return 0;
  const q = Math.min(1, n / 4);
  const m = format === "double" ? 2 : 1;
  const raw = q * (m * (20 + (80 * w) / n) + bonus);
  // Half-up at 2 dp; nudge guards binary float (62.4999… → 62.50).
  return Math.round((raw + 1e-9) * 100) / 100;
}

// ---------------------------------------------------------------- queue
export type QueuePlayer = { id: string; rating: number; waiting_since: string };
export type FairPlayer = QueuePlayer & { joined_at: string; opportunities: number };

/** Fairness order: fewest games tonight (plus late-arrival offset), longest since last game, earliest check-in, id. */
export function fairOrder<T extends FairPlayer>(players: T[]): T[] {
  return [...players].sort(
    (a, b) =>
      a.opportunities - b.opportunities ||
      a.waiting_since.localeCompare(b.waiting_since) ||
      a.joined_at.localeCompare(b.joined_at) ||
      a.id.localeCompare(b.id),
  );
}

/** The next players off the queue for one court. */
export function nextUp<T extends FairPlayer>(waiting: T[], teamSize: number): T[] | null {
  const need = teamSize * 2;
  if (waiting.length < need) return null;
  return fairOrder(waiting).slice(0, need);
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Count of times each pair has been teammates this session. */
export function partnerCounts(matches: Array<{ team_a: string[]; team_b: string[] }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of matches) {
    for (const team of [g.team_a, g.team_b]) {
      for (let i = 0; i < team.length; i++)
        for (let j = i + 1; j < team.length; j++) {
          const k = pairKey(team[i], team[j]);
          m.set(k, (m.get(k) ?? 0) + 1);
        }
    }
  }
  return m;
}

function repeatCount(team: QueuePlayer[], partners: Map<string, number>) {
  let c = 0;
  for (let i = 0; i < team.length; i++)
    for (let j = i + 1; j < team.length; j++) c += partners.get(pairKey(team[i].id, team[j].id)) ?? 0;
  return c;
}

const sum = (t: Array<{ rating: number }>) => t.reduce((a, p) => a + p.rating, 0);

/** Team strength = average rating. */
export function teamAverage(team: Array<{ rating: number }>) {
  return team.length ? sum(team) / team.length : 0;
}

/**
 * Every distinct split of the same players, best first: fewest repeat partners
 * tonight, then the smallest gap between side averages (spec section 5).
 */
export function rankedSplits<T extends QueuePlayer>(players: T[], partners = new Map<string, number>()): Array<[T[], T[]]> {
  const half = players.length / 2;
  const out: Array<{ rep: number; gap: number; split: [T[], T[]] }> = [];
  const rest = players.slice(1);
  const choose = (start: number, picked: T[]) => {
    if (picked.length === half - 1) {
      const a = [players[0], ...picked];
      const b = players.filter((p) => !a.includes(p));
      out.push({ rep: repeatCount(a, partners) + repeatCount(b, partners), gap: Math.abs(teamAverage(a) - teamAverage(b)), split: [a, b] });
      return;
    }
    for (let i = start; i < rest.length; i++) choose(i + 1, [...picked, rest[i]]);
  };
  if (players.length <= 12) choose(0, []);
  else out.push({ rep: 0, gap: 0, split: [players.slice(0, half), players.slice(half)] });
  return out.sort((x, y) => x.rep - y.rep || x.gap - y.gap).map((x) => x.split);
}

export type Balance = { label: "Fair" | "Close" | "Uneven"; gap: number };
/** Spec: preferred side-average gap ≤ 0.35. */
export function balanceOf(a: Array<{ rating: number }>, b: Array<{ rating: number }>): Balance {
  const gap = Math.abs(teamAverage(a) - teamAverage(b));
  return { gap, label: gap <= 0.35 ? "Fair" : gap <= 0.7 ? "Close" : "Uneven" };
}

// ---------------------------------------------------------------- team nights
export type Squad = "A" | "B" | "C";
export const SQUADS: Squad[] = ["A", "B", "C"];
export const MATCHUPS: Array<[Squad, Squad]> = [
  ["A", "B"],
  ["B", "C"],
  ["C", "A"],
];

/** Three squads, sizes within one: snake by rating (A B C C B A), then swaps that shrink the average gap. */
export function makeSquads<T extends { id: string; rating: number }>(players: T[]): Record<Squad, T[]> {
  const sorted = [...players].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const sq: Record<Squad, T[]> = { A: [], B: [], C: [] };
  const snake: Squad[] = ["A", "B", "C", "C", "B", "A"];
  sorted.forEach((p, i) => sq[snake[i % 6]].push(p));
  const spread = () => {
    const avgs = SQUADS.map((s) => teamAverage(sq[s]));
    return Math.max(...avgs) - Math.min(...avgs);
  };
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (const x of SQUADS)
      for (const y of SQUADS) {
        if (x >= y) continue;
        for (let i = 0; i < sq[x].length; i++)
          for (let j = 0; j < sq[y].length; j++) {
            const before = spread();
            [sq[x][i], sq[y][j]] = [sq[y][j], sq[x][i]];
            if (spread() + 1e-9 < before) improved = true;
            else [sq[x][i], sq[y][j]] = [sq[y][j], sq[x][i]];
          }
      }
  }
  return sq;
}

/** Pairs inside a squad: strongest with weakest, so pairs are even. Odd one out gets null. */
export function makePairs<T extends { id: string; rating: number }>(members: T[]): Array<[T, T | null]> {
  const s = [...members].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const out: Array<[T, T | null]> = [];
  while (s.length > 1) out.push([s.shift()!, s.pop()!]);
  if (s.length) out.push([s[0], null]);
  return out;
}

export function minutesSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

// ---------------------------------------------------------------- seasons
const Q = ["Jan to Mar", "Apr to Jun", "Jul to Sep", "Oct to Dec"];
/** Season 1 = Nov–Dec 2026, then calendar quarters (Season 2 = Jan–Mar 2027). Mirrors rr_season_of(). */
export function seasonOf(isoDate: string): number | null {
  if (isoDate < "2026-11-01") return null;
  if (isoDate < "2027-01-01") return 1;
  const [y, m] = isoDate.split("-").map(Number);
  return 2 + (y - 2027) * 4 + Math.floor((m - 1) / 3);
}
export function seasonName(n: number) {
  if (n === 1) return "Season 1 · Nov to Dec 2026";
  const i = n - 2;
  return `Season ${n} · ${Q[i % 4]} ${2027 + Math.floor(i / 4)}`;
}
