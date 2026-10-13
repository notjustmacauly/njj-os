// Game-day matchmaking + rating maths (pure functions, unit-testable).
//
// Queue: longest-waiting first. When a court frees up the next 2 × teamSize
// players by waiting_since go on, split into the fairest teams by rating
// (avoiding people who already partnered tonight where it costs little).

export type Sport = "badminton" | "pickleball" | "volleyball";
export const SPORTS: Array<{ value: Sport; label: string; teamSize: number | null }> = [
  { value: "badminton", label: "Badminton", teamSize: 2 },
  { value: "pickleball", label: "Pickleball", teamSize: 2 },
  { value: "volleyball", label: "Volleyball", teamSize: null }, // 4–6, chosen per session
];

export const SKILL_RATING = { beginner: 2.0, intermediate: 3.5, advanced: 5.0, pro: 6.5 } as const;
export type Skill = keyof typeof SKILL_RATING;

export type QueuePlayer = { id: string; rating: number; waiting_since: string };

/** The next players off the queue for one court (oldest wait first). */
export function nextUp<T extends QueuePlayer>(waiting: T[], teamSize: number): T[] | null {
  const need = teamSize * 2;
  if (waiting.length < need) return null;
  return [...waiting].sort((a, b) => a.waiting_since.localeCompare(b.waiting_since)).slice(0, need);
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

function repeatCost(team: QueuePlayer[], partners: Map<string, number>) {
  let c = 0;
  for (let i = 0; i < team.length; i++)
    for (let j = i + 1; j < team.length; j++) c += partners.get(pairKey(team[i].id, team[j].id)) ?? 0;
  return c;
}

// Cost of reusing a partnership, in rating points. 1.5 ≈ "rotate partners
// unless that makes the match more than ~1.5 rating points lopsided".
const REPEAT_WEIGHT = 1.5;

const sum = (t: QueuePlayer[]) => t.reduce((a, p) => a + p.rating, 0);

/** Split players into two balanced teams. Exhaustive for small groups, snake + swaps for big ones. */
export function balanceTeams<T extends QueuePlayer>(players: T[], partners = new Map<string, number>()): [T[], T[]] {
  const n = players.length;
  const half = n / 2;
  const score = (a: T[], b: T[]) => Math.abs(sum(a) - sum(b)) + REPEAT_WEIGHT * (repeatCost(a, partners) + repeatCost(b, partners));

  if (n <= 10) {
    // Try every split that puts player 0 on team A (avoids mirror duplicates).
    let best: [T[], T[]] | null = null;
    let bestScore = Infinity;
    const rest = players.slice(1);
    const choose = (start: number, picked: T[]) => {
      if (picked.length === half - 1) {
        const a = [players[0], ...picked];
        const b = players.filter((p) => !a.includes(p));
        const s = score(a, b);
        if (s < bestScore) {
          bestScore = s;
          best = [a, b];
        }
        return;
      }
      for (let i = start; i < rest.length; i++) choose(i + 1, [...picked, rest[i]]);
    };
    choose(0, []);
    return best!;
  }

  // Snake draft by rating, then greedy swaps that improve the score.
  const sorted = [...players].sort((x, y) => y.rating - x.rating);
  let a: T[] = [];
  let b: T[] = [];
  sorted.forEach((p, i) => ((i % 4 === 0 || i % 4 === 3 ? a : b).push(p)));
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) {
        const na = [...a];
        const nb = [...b];
        [na[i], nb[j]] = [nb[j], na[i]];
        if (score(na, nb) + 1e-9 < score(a, b)) {
          a = na;
          b = nb;
          improved = true;
        }
      }
  }
  return [a, b];
}

/** Small Elo-style nudge on a 1–8 scale; used only for fair teams, not ranking. */
export function ratingDeltas(teamA: QueuePlayer[], teamB: QueuePlayer[], aWon: boolean) {
  const ra = sum(teamA) / teamA.length;
  const rb = sum(teamB) / teamB.length;
  const expectedA = 1 / (1 + Math.pow(10, (rb - ra) / 1.5));
  const k = 0.12;
  const dA = k * ((aWon ? 1 : 0) - expectedA);
  const clamp = (r: number) => Math.min(8, Math.max(1, Math.round(r * 100) / 100));
  return [
    ...teamA.map((p) => ({ id: p.id, rating: clamp(p.rating + dA) })),
    ...teamB.map((p) => ({ id: p.id, rating: clamp(p.rating - dA) })),
  ];
}

export function minutesSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

/** Team strength = average rating. Balance badge from the gap between teams. */
export function teamAverage(team: Array<{ rating: number }>) {
  return team.length ? team.reduce((a, p) => a + p.rating, 0) / team.length : 0;
}

export type Balance = { label: "Fair" | "Close" | "Uneven"; gap: number };
export function balanceOf(a: Array<{ rating: number }>, b: Array<{ rating: number }>): Balance {
  const gap = Math.abs(teamAverage(a) - teamAverage(b));
  return { gap, label: gap <= 0.35 ? "Fair" : gap <= 0.8 ? "Close" : "Uneven" };
}

/** Rating tier for the coloured badge on each player token. */
export function tierOf(rating: number): Skill {
  return rating < 2.75 ? "beginner" : rating < 4.25 ? "intermediate" : rating < 5.75 ? "advanced" : "pro";
}

/** Every distinct team split of the same players, best first (for Reshuffle). */
export function rankedSplits<T extends QueuePlayer>(players: T[], partners = new Map<string, number>()): Array<[T[], T[]]> {
  if (players.length > 10) return [balanceTeams(players, partners)];
  const half = players.length / 2;
  const out: Array<{ s: number; split: [T[], T[]] }> = [];
  const rest = players.slice(1);
  const choose = (start: number, picked: T[]) => {
    if (picked.length === half - 1) {
      const a = [players[0], ...picked];
      const b = players.filter((p) => !a.includes(p));
      const s = Math.abs(sum(a) - sum(b)) + REPEAT_WEIGHT * (repeatCost(a, partners) + repeatCost(b, partners));
      out.push({ s, split: [a, b] });
      return;
    }
    for (let i = start; i < rest.length; i++) choose(i + 1, [...picked, rest[i]]);
  };
  choose(0, []);
  return out.sort((x, y) => x.s - y.s).map((x) => x.split);
}
