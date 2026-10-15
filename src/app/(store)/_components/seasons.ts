// Rally & Rank seasons: Season 1 = Nov to Dec 2026, then calendar quarters
// (same rule as rr_season_of() in the database).
export { seasonName, seasonOf } from "@/app/dashboard/games/logic";
import { seasonOf } from "@/app/dashboard/games/logic";

export function currentSeason(now = new Date()): number {
  return seasonOf(now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })) ?? 1;
}

export const SPORT_LABEL: Record<string, string> = { badminton: "Badminton", pickleball: "Pickleball", volleyball: "Volleyball" };
export const SPORT_ORDER = ["badminton", "pickleball", "volleyball"];
