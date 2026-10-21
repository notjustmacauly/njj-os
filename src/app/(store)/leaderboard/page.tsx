import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatLabel } from "@/app/dashboard/games/logic";
import { Badge, BadgeLegend, sortBadges, type BadgeKey, type BadgeRow } from "../_components/badges";
import { Reveal } from "../_components/reveal";
import { currentSeason, seasonName, SPORT_LABEL, SPORT_ORDER } from "../_components/seasons";
import { Btn, Container, Lede } from "../_components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Rally & Rank badminton and Spike & Chill volleyball standings: League Points, ratings, results and badges.",
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
  eligible?: boolean;
  draws?: number;
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
  prorated?: boolean;
  draws?: number;
  rating_change?: number;
};

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// Pastel avatar per name (same idea as the Game Day board).
const AVATAR = ["#F4C0D1", "#9FE1CB", "#FAC775", "#B5D4F4", "#CECBF6", "#F5C4B3", "#C0DD97"];
function avatar(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
const initials = (n: string) =>
  n
    .replace(/\./g, "")
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#26215C]"
      style={{ width: size, height: size, background: avatar(name), fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

const MEDALS = [
  { rimA: "#F6D36B", rimB: "#C9962A", face: "#FFF4D6", ink: "#8A6414" },
  { rimA: "#E4E9EF", rimB: "#A7B1BD", face: "#FFFFFF", ink: "#5B6573" },
  { rimA: "#E7B184", rimB: "#B0703C", face: "#FCEBDD", ink: "#7A4520" },
];
function MedalCoin({ place, size = 64 }: { place: number; size?: number }) {
  const m = MEDALS[place - 1];
  return (
    <span
      aria-label={`${place} place`}
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `repeating-conic-gradient(${m.rimA} 0deg 8deg, ${m.rimB} 8deg 16deg)`,
        boxShadow: "0 10px 22px rgba(15,20,30,0.22), inset 0 0 0 2px rgba(255,255,255,0.4)",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full font-display font-semibold tabular-nums"
        style={{
          width: size * 0.76,
          height: size * 0.76,
          background: `radial-gradient(circle at 32% 26%, #fff 0%, ${m.face} 45%, ${m.rimA} 100%)`,
          color: m.ink,
          fontSize: size * 0.34,
          boxShadow: `inset 0 2px 0 rgba(255,255,255,0.9), 0 0 0 2px ${m.rimB}`,
        }}
      >
        {place}
      </span>
    </span>
  );
}

function Seg({ items }: { items: Array<{ href: string; label: string; active: boolean }> }) {
  return (
    <div className="inline-flex rounded-full bg-s-sunken p-1 ring-1 ring-s-line/[0.06]">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold transition duration-300 ease-settle",
            i.active ? "bg-s-invert text-s-invert-fg shadow-sm" : "text-s-muted hover:text-s-fg",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: { view?: string; sport?: string; season?: string; event?: string; eligible?: string };
}) {
  const supabase = await createClient();
  const [{ data: seasonData }, { data: eventData }, { data: vbSeason }, { data: vbEvent }, { data: badgeData }] = await Promise.all([
    supabase.from("web_rr_season").select("*").order("rank").limit(5000),
    supabase.from("web_rr_event").select("*").order("session_date", { ascending: false }).order("rank").limit(5000),
    supabase.from("web_vb_season").select("*").order("rank").limit(5000),
    supabase.from("web_vb_event").select("*").order("session_date", { ascending: false }).order("rank").limit(5000),
    supabase.from("web_badges").select("sport, season, player_id, badge, detail").limit(20000),
  ]);
  const seasonRows = [...((seasonData ?? []) as SeasonRow[]), ...((vbSeason ?? []) as SeasonRow[])];
  const eventRows = [
    ...((eventData ?? []) as EventRow[]),
    ...((vbEvent ?? []) as Array<EventRow & { rating_after: number }>).map((r) => ({ ...r, rating: r.rating_after })),
  ];
  const badges = (badgeData ?? []) as BadgeRow[];

  const view = searchParams.view === "event" ? "event" : "season";
  const sports = SPORT_ORDER.filter((s) => s === "badminton" || s === "volleyball" || seasonRows.some((r) => r.sport === s));
  const sport = searchParams.sport && SPORT_ORDER.includes(searchParams.sport) ? searchParams.sport : "badminton";
  const isVb = sport === "volleyball";
  const now = currentSeason();
  const seasons = Array.from(new Set([now, ...seasonRows.filter((r) => r.sport === sport).map((r) => r.season)])).sort((a, b) => b - a);
  const season = Number(searchParams.season) || now;
  const eligibleOnly = searchParams.eligible === "1" && !isVb;

  const q = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const all = { view, sport, season, eligible: eligibleOnly ? "1" : undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/leaderboard?${p.toString()}`;
  };

  // A player's badges for a season (champion crowns from any season).
  const badgesFor = (playerId: string, s: number) =>
    sortBadges(badges.filter((b) => b.sport === sport && b.player_id === playerId && (b.season === s || b.badge === "champion"))).filter(
      (b, i, arr) => arr.findIndex((x) => x.badge === b.badge && x.detail === b.detail) === i,
    );

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
  const podium = seasonTable.slice(0, 3);

  return (
    <Container className="pt-14 md:pt-20">
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <Reveal className="md:col-span-7">
          <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">{isVb ? "Spike & Chill" : "Rally & Rank"}</h1>
          <Lede className="mt-5">
            {isVb
              ? "Volleyball standings. 20 League Points for playing, up to 80 more for your win rate, draws count half. Up to 100 a night."
              : "Badminton standings. 20 League Points for playing, up to 80 more for your win rate. Play 4 games for full points."}
          </Lede>
        </Reveal>
        <div className="md:col-span-5 md:justify-self-end">
          <Seg items={sports.map((s) => ({ href: q({ sport: s, event: undefined, eligible: undefined }), label: SPORT_LABEL[s], active: s === sport }))} />
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Seg
          items={[
            { href: q({ view: "season" }), label: "Season", active: view === "season" },
            { href: q({ view: "event" }), label: "Events", active: view === "event" },
          ]}
        />
        {view === "season" ? (
          <div className="flex flex-wrap items-center gap-1">
            {seasons.map((k) => (
              <Link
                key={k}
                href={q({ season: k })}
                className={cn("rounded-full px-3.5 py-2 text-sm transition", k === season ? "bg-s-surface font-semibold text-s-fg ring-1 ring-s-line/10" : "text-s-muted hover:text-s-fg")}
              >
                {seasonName(k)}
              </Link>
            ))}
          </div>
        ) : null}
        {view === "season" && !isVb ? (
          <Link
            href={q({ eligible: eligibleOnly ? undefined : "1" })}
            className={cn(
              "md:ml-auto inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm ring-1 transition",
              eligibleOnly ? "bg-s-invert text-s-invert-fg ring-transparent" : "text-s-fg ring-s-line/15 hover:ring-s-line/40",
            )}
          >
            <Badge badge="eligible" detail="" compact /> Award eligible only
          </Link>
        ) : null}
      </div>

      {view === "season" ? (
        seasonTable.length === 0 ? (
          <Empty
            title={eligibleOnly ? "Nobody is award eligible yet." : season === 1 ? "Season 1 starts 1 November." : "No finalized events yet this season."}
            body="Points land here once each event is finalized."
          />
        ) : (
          <>
            {/* Podium: 2nd, 1st, 3rd on desktop; 1st first on phones. */}
            <ol className="mt-10 grid gap-4 md:grid-cols-3 md:items-end">
              {[podium[1], podium[0], podium[2]].map((r, i) =>
                r ? (
                  <li
                    key={r.player_id}
                    className={cn(
                      "relative rounded-[28px] p-6 ring-1 ring-s-line/[0.07] text-center",
                      r.rank === 1 ? "order-first bg-s-brand/30 md:order-none md:pb-10 md:pt-8" : "bg-s-surface",
                    )}
                  >
                    <div className="flex justify-center">
                      <MedalCoin place={r.rank} size={r.rank === 1 ? 76 : 60} />
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-2.5">
                      <Avatar name={r.name} size={32} />
                      <p className="truncate font-display text-2xl font-semibold text-s-fg">{r.name}</p>
                    </div>
                    <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] text-s-fg tabular-nums">
                      {Number(r.lp).toFixed(2)}
                      <span className="ml-1 text-base font-semibold text-s-muted">LP</span>
                    </p>
                    <p className="mt-1 text-sm text-s-muted tabular-nums">
                      {r.wins}W{isVb && r.draws ? ` ${r.draws}D` : ""} {r.matches - r.wins - (r.draws ?? 0)}L · {Number(r.win_rate).toFixed(1)}% · rating {Number(r.rating).toFixed(isVb ? 3 : 2)}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      {badgesFor(r.player_id, season)
                        .filter((b) => b.badge !== "podium")
                        .map((b) => (
                          <Badge key={b.badge + b.detail} badge={b.badge} detail={b.detail} compact />
                        ))}
                    </div>
                  </li>
                ) : (
                  <li key={`empty-${i}`} className="hidden md:block" />
                ),
              )}
            </ol>

            {seasonTable.length > 3 ? (
              <Standings
                isVb={isVb}
                rows={seasonTable.slice(3).map((r) => ({
                  key: r.player_id,
                  rank: r.rank,
                  name: r.name,
                  rating: r.rating,
                  lp: r.lp,
                  matches: r.matches,
                  wins: r.wins,
                  draws: r.draws ?? 0,
                  winRate: r.win_rate,
                  badges: badgesFor(r.player_id, season),
                }))}
              />
            ) : null}
            {!isVb ? <p className="mt-4 text-sm text-s-muted">Season awards go to the top 3 players with 4+ events and 16+ matches. Everyone stays on the full table.</p> : null}
          </>
        )
      ) : events.length === 0 ? (
        <Empty title="No ranked events yet." body="Results show here from the first night." />
      ) : (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
            {events.slice(0, 16).map((e) => (
              <Link
                key={e.session_id}
                href={q({ event: e.session_id })}
                className={cn(
                  "shrink-0 rounded-[18px] px-4 py-3 text-left ring-1 transition",
                  e.session_id === eventId ? "bg-s-invert text-s-invert-fg ring-transparent" : "bg-s-surface text-s-fg ring-s-line/10 hover:ring-s-line/30",
                )}
              >
                <span className="block text-sm font-semibold">{e.event_name ?? formatLabel(e.format)}</span>
                <span className="block text-xs opacity-70">
                  {shortDate(e.session_date)} · {formatLabel(e.format)}
                  {e.final ? "" : " · Live"}
                </span>
              </Link>
            ))}
          </div>
          {event ? (
            <p className="mt-4 text-sm text-s-muted">{event.final ? "Final results." : "In progress. Points are provisional until the event is finalized, and bonuses are added then."}</p>
          ) : null}
          <Standings
            isVb={isVb}
            medals
            rows={eventTable.map((r) => ({
              key: r.player_id,
              rank: r.rank,
              name: r.name,
              rating: r.rating,
              lp: r.lp,
              matches: r.matches,
              wins: r.wins,
              draws: r.draws ?? 0,
              winRate: r.win_rate,
              note: r.prorated ? "prorated" : undefined,
              change: isVb ? r.rating_change : undefined,
              badges: badgesFor(r.player_id, season).filter((b) => b.badge === "champion" || b.badge === "first_event" || b.badge === "provisional"),
            }))}
          />
        </>
      )}

      {/* Badge guide */}
      <section className="mt-20">
        <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-s-fg">Badges</h2>
        <p className="mt-2 max-w-[60ch] text-s-muted">Earned on the court and updated after every finalized event. Champion crowns are for keeps.</p>
        <div className="mt-8">
          <BadgeLegend
            keys={(isVb ? ["champion", "podium", "on_fire", "unbeaten", "rising", "regular", "iron", "first_event", "provisional"] : undefined) as BadgeKey[] | undefined}
          />
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-7">
          <p className="font-display text-xl font-semibold text-s-fg">How points work</p>
          <p className="mt-2 text-sm text-s-muted">
            {isVb
              ? "20 + 80 × your win rate each night, draws count half. Double Points doubles it, Team Night adds +5 for each round your team wins, Rivalry Night +5 for winning your rivalry game. Capped at 100. Your rating (1.00 to 5.00) is separate and moves with your team's results."
              : "20 + 80 × your win rate each event. Fewer than 4 games earns a share (2 games, half). Double Points nights count twice, Team nights add +10 for the top squad and +5 for second. Your rating (1.00 to 6.00) is separate and moves after every game."}
          </p>
        </div>
        <div className="rounded-[28px] bg-s-sunken p-7">
          <p className="font-display text-xl font-semibold text-s-fg">See your own rank</p>
          <p className="mt-2 text-sm text-s-muted">Create a NotJust account with the email you book with, and your standing and badges show up there.</p>
          <div className="mt-4">
            <Btn href="/account" arrow>
              Your account
            </Btn>
          </div>
        </div>
      </section>
    </Container>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-10 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] px-8 py-16 text-center">
      <div className="flex items-end justify-center gap-2 opacity-90">
        <MedalCoin place={2} size={40} />
        <MedalCoin place={1} size={52} />
        <MedalCoin place={3} size={40} />
      </div>
      <p className="mt-6 font-display text-2xl font-semibold text-s-fg">{title}</p>
      <p className="mt-2 text-s-muted">{body}</p>
      <div className="mt-6">
        <Btn href="/events" arrow>
          Find an event
        </Btn>
      </div>
    </div>
  );
}

type StandingRow = {
  key: string;
  rank: number;
  name: string;
  rating: number;
  lp: number;
  matches: number;
  wins: number;
  draws: number;
  winRate: number | null;
  note?: string;
  change?: number;
  badges: BadgeRow[];
};

const pct = (v: number | null) => (v == null ? "-" : `${Number(v).toFixed(1)}%`);

function Standings({ rows, isVb, medals }: { rows: StandingRow[]; isVb: boolean; medals?: boolean }) {
  const cols = "md:grid-cols-[56px_minmax(0,1fr)_110px_100px_72px_64px_64px_80px]";
  return (
    <div className="mt-6 overflow-hidden rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07]">
      <div className={cn("hidden md:grid gap-3 px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-s-muted", cols)}>
        <span>Rank</span>
        <span>Player</span>
        <span className="text-right">Rating</span>
        <span className="text-right">LP</span>
        <span className="text-right">Matches</span>
        <span className="text-right">Wins</span>
        <span className="text-right">{isVb ? "Draws" : "Losses"}</span>
        <span className="text-right">Win rate</span>
      </div>
      <ol>
        {rows.map((r) => (
          <li
            key={r.key}
            className={cn("grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t border-s-line/[0.06] px-4 py-3.5 transition hover:bg-s-line/[0.02] md:px-6", cols)}
          >
            <span className="font-display text-lg font-semibold tabular-nums text-s-muted">{medals && r.rank <= 3 ? <MedalCoin place={r.rank} size={30} /> : r.rank}</span>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={r.name} size={36} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-s-fg">
                  {r.name}
                  {r.note ? <span className="ml-2 text-[11px] font-semibold uppercase text-s-muted">{r.note}</span> : null}
                </p>
                {r.badges.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.badges.map((b) => (
                      <Badge key={b.badge + b.detail} badge={b.badge} detail={b.detail} compact />
                    ))}
                  </div>
                ) : null}
                <p className="mt-1 text-xs text-s-muted tabular-nums md:hidden">
                  {r.wins}W{isVb ? ` ${r.draws}D` : ""} {r.matches - r.wins - r.draws}L · {pct(r.winRate)} · rating {Number(r.rating).toFixed(isVb ? 3 : 2)}
                </p>
              </div>
            </div>
            <span className="hidden text-right tabular-nums text-s-fg md:block">
              {Number(r.rating).toFixed(isVb ? 3 : 2)}
              {r.change ? (
                <span className={cn("block text-[11px] font-semibold", r.change > 0 ? "text-[#2F8F5B]" : "text-s-muted")}>
                  {r.change > 0 ? "+" : ""}
                  {Number(r.change).toFixed(3)}
                </span>
              ) : null}
            </span>
            <span className="text-right font-display text-lg font-semibold tabular-nums text-s-fg">{Number(r.lp).toFixed(2)}</span>
            <span className="hidden text-right tabular-nums text-s-muted md:block">{r.matches}</span>
            <span className="hidden text-right tabular-nums text-s-muted md:block">{r.wins}</span>
            <span className="hidden text-right tabular-nums text-s-muted md:block">{isVb ? r.draws : r.matches - r.wins}</span>
            <span className="hidden text-right tabular-nums text-s-muted md:block">{pct(r.winRate)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
