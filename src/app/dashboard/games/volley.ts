// Spike & Chill Volleyball 2.0 (docs/specs/SPIKE_AND_CHILL_VOLLEYBALL_2_SPEC.txt).
// Pure functions mirroring the database (vb_* functions and views) for the board.

export type VbLevel = "foundation" | "developing" | "intermediate" | "advanced";
export const VB_LEVELS: Array<{ value: VbLevel; label: string; seed: number }> = [
  { value: "foundation", label: "Foundation", seed: 1.5 },
  { value: "developing", label: "Developing", seed: 2.5 },
  { value: "intermediate", label: "Intermediate", seed: 3.5 },
  { value: "advanced", label: "Advanced", seed: 4.5 },
];
/** Staff-only division from the stored rating. */
export function vbDivision(r: number): VbLevel {
  return r < 2 ? "foundation" : r < 3 ? "developing" : r < 4 ? "intermediate" : "advanced";
}

export type VbTag = "setter" | "middle" | "outside" | "opposite" | "defensive";
export const VB_TAGS: Array<{ value: VbTag; short: string; label: string }> = [
  { value: "setter", short: "S", label: "Setter" },
  { value: "middle", short: "M", label: "Middle" },
  { value: "outside", short: "OH", label: "Outside" },
  { value: "opposite", short: "OP", label: "Opposite" },
  { value: "defensive", short: "D", label: "Defensive" },
];

export const BLOCK1 = ["A", "B", "C", "D"] as const;
export const BLOCK2 = ["E", "F", "G", "H"] as const;
const PAIRS: Array<[number, number]> = [
  [0, 1],
  [2, 3],
  [0, 2],
  [1, 3],
  [0, 3],
  [1, 2],
];
/** The fixed 12-game schedule: two round robins, every pair once per block. */
export const SCHEDULE = [1, 2].flatMap((block) => {
  const L = block === 1 ? BLOCK1 : BLOCK2;
  return PAIRS.map(([x, y], i) => ({
    game_no: (block - 1) * 6 + i + 1,
    block,
    a: L[x] as string,
    b: L[y] as string,
    rest: L.filter((_, j) => j !== x && j !== y) as string[],
  }));
});

// ---------------------------------------------------------------- results + LP
export type VbOutcome = "played" | "timed" | "forfeit" | "no_contest";
export function validVbScore(a: number, b: number, outcome: "played" | "timed"): boolean {
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (outcome === "played") return (a === 21 && b <= 20) || (b === 21 && a <= 20);
  return a <= 20 && b <= 20 && a + b > 0;
}

/** LP = min(100, M × (20 + 80 × (W + D/2) / N + bonus)), rounded half up. No minimum games. */
export function vbLeaguePoints(n: number, w: number, d: number, format: string | null, bonus = 0): number {
  if (n <= 0) return 0;
  const m = format === "double" ? 2 : 1;
  const raw = Math.min(100, m * (20 + (80 * (w + 0.5 * d)) / n + (format === "double" ? 0 : bonus)));
  return Math.round((raw + 1e-9) * 100) / 100;
}

// ---------------------------------------------------------------- team generation
export type VbPlayer = { id: string; rating: number; tags: string[] };

/** Deterministic PRNG (mulberry32) from a string seed. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const has = (p: VbPlayer, t: string) => p.tags.includes(t);
/** Capability shortages for one team: 1 setter, 2 middles, 2 outside/opposite (hard); 2 defensive (soft). */
export function deficits(team: VbPlayer[]) {
  const setter = Math.max(0, 1 - team.filter((p) => has(p, "setter")).length);
  const middle = Math.max(0, 2 - team.filter((p) => has(p, "middle")).length);
  const wing = Math.max(0, 2 - team.filter((p) => has(p, "outside") || has(p, "opposite")).length);
  const defensive = Math.max(0, 2 - team.filter((p) => has(p, "defensive")).length);
  return { setter, middle, wing, defensive, hard: setter + middle + wing };
}

const mean = (t: VbPlayer[]) => (t.length ? t.reduce((s, p) => s + p.rating, 0) / t.length : 0);

export type TeamMetrics = { P: number; soft: number; spread: number; variance: number; repeats: number };
export function metrics(teams: VbPlayer[][], prev?: Map<string, string>): TeamMetrics {
  const means = teams.map(mean);
  const all = teams.flat();
  const overall = mean(all);
  let P = 0;
  let soft = 0;
  for (const t of teams) {
    const d = deficits(t);
    P += d.hard;
    soft += d.defensive;
  }
  let repeats = 0;
  if (prev)
    for (const t of teams)
      for (let i = 0; i < t.length; i++)
        for (let j = i + 1; j < t.length; j++) {
          const a = prev.get(t[i].id);
          if (a && a === prev.get(t[j].id)) repeats++;
        }
  return {
    P,
    soft,
    spread: Math.max(...means) - Math.min(...means),
    variance: means.reduce((s, m) => s + (m - overall) ** 2, 0),
    repeats,
  };
}

/** Spec objective: block 1 (P, B, V); block 2 (P, max(0, B − 0.20), R, V, B). Soft defensive last. */
function key(m: TeamMetrics, block: 1 | 2): number[] {
  return block === 1 ? [m.P, m.spread, m.variance, m.soft] : [m.P, Math.max(0, m.spread - 0.2), m.repeats, m.variance, m.spread, m.soft];
}
function better(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - 1e-9) return true;
    if (a[i] > b[i] + 1e-9) return false;
  }
  return false;
}

/**
 * Four balanced teams (sizes within one). Seeded rating-snake candidates, then
 * cross-team swaps accepting the best strict improvement. Not globally optimal.
 */
export function generateTeams(players: VbPlayer[], labels: readonly string[], seed: string, prev?: Map<string, string>, candidates = 96) {
  const block: 1 | 2 = prev ? 2 : 1;
  const base = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const rand = rng(seed);
  let best: VbPlayer[][] | null = null;
  let bestKey: number[] | null = null;
  const k = labels.length;
  for (let c = 0; c < candidates; c++) {
    // Rating snake with seeded jitter so candidates differ.
    const order = base.map((p) => ({ p, s: p.rating + (c === 0 ? 0 : (rand() - 0.5) * 0.6) })).sort((x, y) => y.s - x.s || x.p.id.localeCompare(y.p.id));
    const teams: VbPlayer[][] = labels.map(() => []);
    order.forEach(({ p }, i) => {
      const round = Math.floor(i / k);
      const pos = i % k;
      teams[round % 2 === 0 ? pos : k - 1 - pos].push(p);
    });
    let cur = key(metrics(teams, prev), block);
    for (let pass = 0; pass < 200; pass++) {
      let move: [number, number, number, number] | null = null;
      let moveKey = cur;
      for (let x = 0; x < k; x++)
        for (let y = x + 1; y < k; y++)
          for (let i = 0; i < teams[x].length; i++)
            for (let j = 0; j < teams[y].length; j++) {
              [teams[x][i], teams[y][j]] = [teams[y][j], teams[x][i]];
              const kk = key(metrics(teams, prev), block);
              if (better(kk, moveKey)) {
                moveKey = kk;
                move = [x, i, y, j];
              }
              [teams[x][i], teams[y][j]] = [teams[y][j], teams[x][i]];
            }
      if (!move) break;
      const [x, i, y, j] = move;
      [teams[x][i], teams[y][j]] = [teams[y][j], teams[x][i]];
      cur = moveKey;
    }
    if (!bestKey || better(cur, bestKey)) {
      bestKey = cur;
      best = teams.map((t) => [...t]);
    }
  }
  const teams = best ?? labels.map(() => []);
  return {
    teams: Object.fromEntries(labels.map((l, i) => [l, teams[i].map((p) => p.id)])) as Record<string, string[]>,
    metrics: metrics(teams, prev),
  };
}
