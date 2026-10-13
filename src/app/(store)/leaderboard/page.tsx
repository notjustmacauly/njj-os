import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Reveal } from "../_components/reveal";
import { currentSeasonKey, seasonLabel, SPORT_LABEL, SPORT_ORDER } from "../_components/seasons";
import { Btn, Container, Lede } from "../_components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Community standings for NotJust badminton, pickleball and volleyball. Seasons run every quarter.",
};

type Row = {
  sport: string;
  season_key: number;
  rank: number;
  name: string;
  points: number;
  wins: number;
  losses: number;
  games: number;
  sessions: number;
};

export default async function LeaderboardPage({ searchParams }: { searchParams: { sport?: string; season?: string } }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("web_leaderboard")
    .select("sport, season_key, rank, name, points, wins, losses, games, sessions")
    .order("rank")
    .limit(5000);
  const rows = (data ?? []) as Row[];

  const current = currentSeasonKey();
  const sports = SPORT_ORDER.filter((s) => rows.some((r) => r.sport === s));
  const sport = searchParams.sport && SPORT_ORDER.includes(searchParams.sport) ? searchParams.sport : sports[0] ?? "badminton";
  const seasons = Array.from(new Set([current, ...rows.filter((r) => r.sport === sport && r.season_key > 0).map((r) => r.season_key)])).sort(
    (a, b) => b - a,
  );
  const season = searchParams.season !== undefined && !Number.isNaN(Number(searchParams.season)) ? Number(searchParams.season) : current;
  const table = rows.filter((r) => r.sport === sport && r.season_key === season).slice(0, 100);
  const href = (s: string, k: number) => `/leaderboard?sport=${s}&season=${k}`;

  return (
    <Container className="pt-14 md:pt-20">
      <Reveal className="max-w-2xl">
        <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">Leaderboard</h1>
        <Lede className="mt-5">Win 3, lose 1, and earn 2 more for every event you play. Seasons reset every quarter.</Lede>
      </Reveal>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        {SPORT_ORDER.map((s) => (
          <Link
            key={s}
            href={href(s, season)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition duration-300 ease-settle",
              s === sport ? "bg-s-invert text-s-invert-fg" : "bg-s-surface text-s-fg ring-1 ring-s-line/15 hover:ring-s-line/40",
            )}
          >
            {SPORT_LABEL[s]}
          </Link>
        ))}
        <span className="mx-2 h-6 w-px bg-s-line/15" aria-hidden />
        {[...seasons, 0].map((k) => (
          <Link
            key={k}
            href={href(sport, k)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm transition",
              k === season ? "bg-s-sunken font-semibold text-s-fg" : "text-s-muted hover:text-s-fg",
            )}
          >
            {k === current ? `This season (${seasonLabel(k)})` : seasonLabel(k)}
          </Link>
        ))}
      </div>

      {table.length === 0 ? (
        <div className="mt-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] px-8 py-16 text-center">
          <p className="font-display text-2xl font-semibold text-s-fg">No games yet this season.</p>
          <p className="mt-2 text-s-muted">Play an event to get on the board.</p>
          <div className="mt-6">
            <Btn href="/events" arrow>
              Find an event
            </Btn>
          </div>
        </div>
      ) : (
        <>
          {/* Podium */}
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {table.slice(0, 3).map((r) => (
              <li
                key={r.rank + r.name}
                className={cn(
                  "rounded-[28px] p-6 ring-1 ring-s-line/[0.07]",
                  r.rank === 1 ? "bg-s-brand/35" : "bg-s-surface",
                )}
              >
                <p className="font-display text-5xl font-semibold tracking-[-0.04em] text-s-fg tabular-nums">{r.rank}</p>
                <p className="mt-3 font-display text-2xl font-semibold text-s-fg truncate">{r.name}</p>
                <p className="mt-1 text-sm text-s-muted tabular-nums">
                  {r.points} pts. {r.wins} won, {r.losses} lost
                </p>
              </li>
            ))}
          </ol>

          {table.length > 3 ? (
            <div className="mt-4 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-s-muted">
                  <tr className="text-left">
                    <th className="px-5 py-3 font-semibold w-16">Rank</th>
                    <th className="px-5 py-3 font-semibold">Player</th>
                    <th className="px-5 py-3 font-semibold text-right">Points</th>
                    <th className="px-5 py-3 font-semibold text-right hidden sm:table-cell">Won</th>
                    <th className="px-5 py-3 font-semibold text-right hidden sm:table-cell">Lost</th>
                    <th className="px-5 py-3 font-semibold text-right">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {table.slice(3).map((r) => (
                    <tr key={r.rank + r.name} className="border-t border-s-line/[0.06]">
                      <td className="px-5 py-3 tabular-nums text-s-muted">{r.rank}</td>
                      <td className="px-5 py-3 font-semibold text-s-fg">{r.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-s-fg">{r.points}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-s-muted hidden sm:table-cell">{r.wins}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-s-muted hidden sm:table-cell">{r.losses}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-s-muted">{r.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      <p className="mt-6 text-sm text-s-muted">
        Played with a pass? Create an account with the same email to see your own rank.{" "}
        <Link href="/account" className="font-semibold text-s-fg underline underline-offset-4">
          Your account
        </Link>
      </p>
    </Container>
  );
}
