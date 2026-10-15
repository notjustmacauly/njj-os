import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/app/dashboard/games/logic";
import { Reveal } from "../_components/reveal";
import { currentSeason, seasonName, SPORT_LABEL, SPORT_ORDER } from "../_components/seasons";
import { Btn, Container, Lede } from "../_components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Rally & Rank leaderboard",
  description: "Rally & Rank standings: League Points, ratings and results for every NotJust ranked event.",
};

type SeasonRow = {
  sport: string;
  season: number;
  rank: number;
  player_id: string;
  name: string;
  rating: number;
  provisional: boolean;
  lp: number;
  matches: number;
  wins: number;
  win_rate: number;
  events: number;
  eligible: boolean;
};
type EventRow = {
  session_id: string;
  sport: string;
  format: string;
  session_date: string;
  event_name: string | null;
  final: boolean;
  rank: number;
  player_id: string;
  name: string;
  rating: number;
  provisional: boolean;
  lp: number;
  matches: number;
  wins: number;
  win_rate: number | null;
  prorated: boolean;
};

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold transition duration-300 ease-settle",
        active ? "bg-s-invert text-s-invert-fg" : "bg-s-surface text-s-fg ring-1 ring-s-line/15 hover:ring-s-line/40",
      )}
    >
      {children}
    </Link>
  );
}

function Rating({ value, provisional }: { value: number; provisional: boolean }) {
  return (
    <span className="tabular-nums">
      {Number(value).toFixed(2)}
      {provisional ? <span className="ml-1.5 rounded-full bg-s-sunken px-1.5 py-0.5 text-[10px] font-semibold text-s-muted align-middle">Provisional</span> : null}
    </span>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { view?: string; sport?: string; season?: string; event?: string; eligible?: string };
}) {
  const supabase = await createClient();
  const [{ data: seasonData }, { data: eventData }] = await Promise.all([
    supabase.from("web_rr_season").select("*").order("rank").limit(5000),
    supabase.from("web_rr_event").select("*").order("session_date", { ascending: false }).order("rank").limit(5000),
  ]);
  const seasonRows = (seasonData ?? []) as SeasonRow[];
  const eventRows = (eventData ?? []) as EventRow[];

  const view = searchParams.view === "event" ? "event" : "season";
  const sportsWithData = SPORT_ORDER.filter((s) => seasonRows.some((r) => r.sport === s) || eventRows.some((r) => r.sport === s));
  const sport = searchParams.sport && SPORT_ORDER.includes(searchParams.sport) ? searchParams.sport : sportsWithData[0] ?? "badminton";
  const now = currentSeason();
  const seasons = Array.from(new Set([now, ...seasonRows.filter((r) => r.sport === sport).map((r) => r.season)])).sort((a, b) => b - a);
  const season = Number(searchParams.season) || now;
  const eligibleOnly = searchParams.eligible === "1";

  const q = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { view, sport, season, eligible: eligibleOnly ? "1" : undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/leaderboard?${p.toString()}`;
  };

  // Events list (newest first) for the event tab.
  const events = Array.from(
    eventRows
      .filter((r) => r.sport === sport)
      .reduce((m, r) => m.set(r.session_id, r), new Map<string, EventRow>())
      .values(),
  );
  const eventId = searchParams.event && events.some((e) => e.session_id === searchParams.event) ? searchParams.event : events[0]?.session_id;
  const event = events.find((e) => e.session_id === eventId);

  const seasonTable = seasonRows.filter((r) => r.sport === sport && r.season === season && (!eligibleOnly || r.eligible));
  const eventTable = eventRows.filter((r) => r.session_id === eventId);

  return (
    <Container className="pt-14 md:pt-20">
      <Reveal className="max-w-2xl">
        <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">Rally &amp; Rank</h1>
        <Lede className="mt-5">
          Every ranked event earns League Points: 20 for showing up and playing, plus up to 80 more for your win rate. Play at least 4 games for full points.
        </Lede>
      </Reveal>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Pill href={q({ view: "season" })} active={view === "season"}>
          Season
        </Pill>
        <Pill href={q({ view: "event" })} active={view === "event"}>
          Events
        </Pill>
        {sportsWithData.length > 1 ? (
          <>
            <span className="mx-2 h-6 w-px bg-s-line/15" aria-hidden />
            {sportsWithData.map((s) => (
              <Pill key={s} href={q({ sport: s, event: undefined })} active={s === sport}>
                {SPORT_LABEL[s]}
              </Pill>
            ))}
          </>
        ) : null}
      </div>

      {view === "season" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {seasons.map((k) => (
              <Link
                key={k}
                href={q({ season: k })}
                className={cn("rounded-full px-3.5 py-1.5 text-sm transition", k === season ? "bg-s-sunken font-semibold text-s-fg" : "text-s-muted hover:text-s-fg")}
              >
                {seasonName(k)}
              </Link>
            ))}
            <Link
              href={q({ eligible: eligibleOnly ? undefined : "1" })}
              className={cn(
                "ml-auto rounded-full px-3.5 py-1.5 text-sm ring-1 transition",
                eligibleOnly ? "bg-s-invert text-s-invert-fg ring-transparent" : "text-s-fg ring-s-line/15 hover:ring-s-line/40",
              )}
            >
              Eligible for awards
            </Link>
          </div>

          {seasonTable.length === 0 ? (
            <div className="mt-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] px-8 py-16 text-center">
              <p className="font-display text-2xl font-semibold text-s-fg">
                {eligibleOnly ? "Nobody is award eligible yet." : season === 1 ? "Season 1 starts 1 November." : "No finalized events yet this season."}
              </p>
              <p className="mt-2 text-s-muted">Points land here once each event is finalized.</p>
              <div className="mt-6">
                <Btn href="/events" arrow>
                  Find an event
                </Btn>
              </div>
            </div>
          ) : (
            <>
              <ol className="mt-8 grid gap-4 sm:grid-cols-3">
                {seasonTable.slice(0, 3).map((r) => (
                  <li key={r.player_id} className={cn("rounded-[28px] p-6 ring-1 ring-s-line/[0.07]", r.rank === 1 ? "bg-s-brand/35" : "bg-s-surface")}>
                    <p className="font-display text-5xl font-semibold tracking-[-0.04em] text-s-fg tabular-nums">{r.rank}</p>
                    <p className="mt-3 font-display text-2xl font-semibold text-s-fg truncate">{r.name}</p>
                    <p className="mt-1 text-sm text-s-muted tabular-nums">
                      {Number(r.lp).toFixed(2)} LP. {r.wins} won of {r.matches}
                    </p>
                  </li>
                ))}
              </ol>
              <SeasonTable rows={seasonTable} />
            </>
          )}
          <p className="mt-4 text-sm text-s-muted">
            Awards go to the top 3 players with at least 4 events and 16 matches in the season. The full ranking includes everyone.
          </p>
        </>
      ) : (
        <>
          {events.length === 0 ? (
            <div className="mt-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] px-8 py-16 text-center">
              <p className="font-display text-2xl font-semibold text-s-fg">No ranked events yet.</p>
              <div className="mt-6">
                <Btn href="/events" arrow>
                  Find an event
                </Btn>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                {events.slice(0, 12).map((e) => (
                  <Link
                    key={e.session_id}
                    href={q({ event: e.session_id })}
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-left ring-1 transition",
                      e.session_id === eventId ? "bg-s-invert text-s-invert-fg ring-transparent" : "bg-s-surface text-s-fg ring-s-line/15 hover:ring-s-line/40",
                    )}
                  >
                    <span className="block text-sm font-semibold">{e.event_name ?? formatLabel(e.format)}</span>
                    <span className="block text-xs opacity-70">
                      {shortDate(e.session_date)}. {formatLabel(e.format)}
                      {e.final ? "" : ". Live"}
                    </span>
                  </Link>
                ))}
              </div>
              {event ? (
                <p className="mt-6 text-sm text-s-muted">
                  {event.final ? "Final results." : "In progress. Points are provisional until the event is finalized, and team bonuses are added then."}
                </p>
              ) : null}
              <EventTable rows={eventTable} />
            </>
          )}
        </>
      )}

      <section className="mt-14 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.07] p-6">
          <p className="font-display text-xl font-semibold text-s-fg">League Points</p>
          <p className="mt-2 text-sm text-s-muted">
            20 + 80 × your win rate each event. Fewer than 4 games earns a share (2 games, half). Double Points nights count twice. Team nights add +10 for the top squad and +5 for second.
          </p>
        </div>
        <div className="rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.07] p-6">
          <p className="font-display text-xl font-semibold text-s-fg">Rating</p>
          <p className="mt-2 text-sm text-s-muted">
            A skill estimate from 1.00 to 6.00 that moves after every game, more when you beat a stronger side. It is separate from League Points. Provisional for your first 2 events.
          </p>
        </div>
        <div className="rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.07] p-6">
          <p className="font-display text-xl font-semibold text-s-fg">Your account</p>
          <p className="mt-2 text-sm text-s-muted">
            Played with a pass? Create an account with the same email to see your own rank.{" "}
            <Link href="/account" className="font-semibold text-s-fg underline underline-offset-4">
              Your account
            </Link>
          </p>
        </div>
      </section>
    </Container>
  );
}

function SeasonTable({ rows }: { rows: SeasonRow[] }) {
  return (
    <div className="mt-4 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="text-s-muted">
          <tr className="text-left">
            <th className="px-5 py-3 font-semibold w-16">Rank</th>
            <th className="px-5 py-3 font-semibold">Name</th>
            <th className="px-5 py-3 font-semibold">Rating</th>
            <th className="px-5 py-3 font-semibold text-right">LP</th>
            <th className="px-5 py-3 font-semibold text-right">Total matches</th>
            <th className="px-5 py-3 font-semibold text-right">Wins</th>
            <th className="px-5 py-3 font-semibold text-right">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player_id} className="border-t border-s-line/[0.06]">
              <td className="px-5 py-3 tabular-nums text-s-muted">{r.rank}</td>
              <td className="px-5 py-3 font-semibold text-s-fg">
                {r.name}
                {r.eligible ? <span className="ml-2 text-[10px] font-semibold uppercase text-s-muted">Award eligible</span> : null}
              </td>
              <td className="px-5 py-3 text-s-fg">
                <Rating value={r.rating} provisional={r.provisional} />
              </td>
              <td className="px-5 py-3 text-right tabular-nums font-semibold text-s-fg">{Number(r.lp).toFixed(2)}</td>
              <td className="px-5 py-3 text-right tabular-nums text-s-muted">{r.matches}</td>
              <td className="px-5 py-3 text-right tabular-nums text-s-muted">{r.wins}</td>
              <td className="px-5 py-3 text-right tabular-nums text-s-muted">{Number(r.win_rate).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventTable({ rows }: { rows: EventRow[] }) {
  return (
    <div className="mt-4 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="text-s-muted">
          <tr className="text-left">
            <th className="px-5 py-3 font-semibold w-16">Rank</th>
            <th className="px-5 py-3 font-semibold">Name</th>
            <th className="px-5 py-3 font-semibold">Rating</th>
            <th className="px-5 py-3 font-semibold text-right">LP</th>
            <th className="px-5 py-3 font-semibold text-right">Matches</th>
            <th className="px-5 py-3 font-semibold text-right">Wins</th>
            <th className="px-5 py-3 font-semibold text-right">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player_id} className="border-t border-s-line/[0.06]">
              <td className="px-5 py-3 tabular-nums text-s-muted">{r.rank}</td>
              <td className="px-5 py-3 font-semibold text-s-fg">
                {r.name}
                {r.prorated ? <span className="ml-2 text-[10px] font-semibold uppercase text-s-muted">Prorated</span> : null}
              </td>
              <td className="px-5 py-3 text-s-fg">
                <Rating value={r.rating} provisional={r.provisional} />
              </td>
              <td className="px-5 py-3 text-right tabular-nums font-semibold text-s-fg">{Number(r.lp).toFixed(2)}</td>
              <td className="px-5 py-3 text-right tabular-nums text-s-muted">{r.matches}</td>
              <td className="px-5 py-3 text-right tabular-nums text-s-muted">{r.wins}</td>
              <td className="px-5 py-3 text-right tabular-nums text-s-muted">{r.win_rate == null ? "—" : `${Number(r.win_rate).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
