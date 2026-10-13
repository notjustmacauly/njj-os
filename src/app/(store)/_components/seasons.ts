// Leaderboard seasons are calendar quarters, keyed year*10 + quarter (20264 =
// Oct to Dec 2026). 0 = all time.
const Q = ["Jan to Mar", "Apr to Jun", "Jul to Sep", "Oct to Dec"];

export function currentSeasonKey(now = new Date()): number {
  const d = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return d.getFullYear() * 10 + Math.floor(d.getMonth() / 3) + 1;
}

export function seasonLabel(key: number): string {
  if (!key) return "All time";
  const y = Math.floor(key / 10);
  const q = key % 10;
  return `${Q[q - 1] ?? `Q${q}`} ${y}`;
}

export const SPORT_LABEL: Record<string, string> = { badminton: "Badminton", pickleball: "Pickleball", volleyball: "Volleyball" };
export const SPORT_ORDER = ["badminton", "pickleball", "volleyball"];
