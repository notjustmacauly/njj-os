import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPHP } from "@/lib/utils";
import { Badge, sortBadges, type BadgeRow } from "../_components/badges";
import { fmtEventDate, timeRange } from "../_components/events";
import { ArrowUpRightLine, CalendarBlank, MapPinLine, PackageLine, TicketLine, TrophyLine, WalletLine } from "../_components/icons";
import { Btn, Container, Panel } from "../_components/ui";
import { ProfileForm, SignOutButton } from "./account-client";
import { currentSeason, seasonName, SPORT_LABEL } from "../_components/seasons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

type Pass = {
  code: string;
  sport: string;
  holder: string | null;
  for_me: boolean;
  booked_by_me: boolean;
  event_name: string;
  event_slug: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  checked_in: boolean;
  receipt_token: string | null;
  verified: boolean;
};
type Order = {
  reference: string;
  created_at: string;
  total: number | string;
  items: Array<{ name: string }>;
  status: string;
  receipt_token: string;
  next_delivery: string | null;
};
type Me = {
  email: string;
  email_confirmed: boolean;
  member_since: string;
  is_staff: boolean;
  full_name: string | null;
  phone: string | null;
  wallet: number;
  wallet_history: Array<{ delta: number; kind: string; note: string | null; at: string }>;
  passes: Pass[];
  orders: Order[];
};
type Standing = { sport: string; season: number; player_id: string; rank: number; lp: number; wins: number; matches: number; events: number; rating: number; provisional: boolean; of: number };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: iso.length === 10 ? "UTC" : "Asia/Manila" });
const WALLET_KIND: Record<string, string> = { bundle: "Bundle bought", redeem: "Used for a booking", reversal: "Payment not received", staff: "Adjusted by NotJust" };

function DateTile({ iso, big }: { iso: string; big?: boolean }) {
  const d = new Date(`${iso}T00:00:00Z`);
  return (
    <div className={cn("shrink-0 rounded-[18px] bg-s-brand/30 flex flex-col items-center justify-center", big ? "w-24 h-24" : "w-16 h-16")}>
      <span className={cn("font-display font-semibold leading-none text-s-fg tabular-nums", big ? "text-4xl" : "text-2xl")}>{d.getUTCDate()}</span>
      <span className="text-[11px] font-semibold text-s-fg/70">{d.toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" })}</span>
    </div>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account/login");

  const [{ data, error }, { data: standingRows }] = await Promise.all([supabase.rpc("member_me"), supabase.rpc("member_standings")]);
  if (error || !data) redirect("/account/login");
  const me = data as Me;
  const season = currentSeason();
  const standings = ((standingRows ?? []) as Standing[]).filter((s) => s.season === season);
  const playerIds = Array.from(new Set(standings.map((s) => s.player_id)));
  const { data: badgeData } = playerIds.length
    ? await supabase.from("web_badges").select("sport, season, player_id, badge, detail").in("player_id", playerIds)
    : { data: [] };
  const badges = (badgeData ?? []) as BadgeRow[];

  const t = today();
  const upcoming = me.passes.filter((p) => p.event_date >= t);
  const past = me.passes.filter((p) => p.event_date < t && p.for_me).reverse();
  const byEvent = new Map<string, Pass[]>();
  for (const p of upcoming) {
    const k = `${p.event_date}|${p.event_name}|${p.receipt_token ?? ""}`;
    byEvent.set(k, [...(byEvent.get(k) ?? []), p]);
  }
  const groups = Array.from(byEvent.values());
  const next = groups[0];
  const first = (me.full_name ?? "").split(" ")[0] || null;
  const initials = (me.full_name ?? me.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Container className="pt-14 md:pt-20">
      {/* Greeting */}
      <div className="flex flex-wrap items-center gap-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-s-brand/40 font-display text-2xl font-semibold text-s-fg">{initials}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display font-semibold tracking-[-0.04em] leading-[1] text-4xl md:text-5xl text-s-fg">{first ? `Hi, ${first}.` : "Your account"}</h1>
          <p className="mt-2 text-s-muted">
            {me.email}
            {me.member_since ? ` · member since ${new Date(me.member_since).toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" })}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn href="/events" arrow>
            Book an event
          </Btn>
          {me.is_staff ? (
            <Btn href="/hub" variant="quiet">
              Staff directory
            </Btn>
          ) : null}
        </div>
      </div>

      {!me.email_confirmed ? (
        <div className="mt-8 rounded-[20px] bg-s-brand/25 px-5 py-4 text-s-fg">Confirm your email to see your passes and orders. Open the link we emailed to {me.email}.</div>
      ) : null}

      <div className="mt-10 grid gap-4 lg:grid-cols-12">
        {/* Wallet */}
        <section className="lg:col-span-4 rounded-[28px] bg-s-invert p-7 text-s-invert-fg">
          <div className="flex items-center gap-2 text-sm font-semibold opacity-80">
            <WalletLine className="w-4 h-4" /> Pass wallet
          </div>
          <p className="mt-4 font-display text-6xl font-semibold tracking-[-0.04em] tabular-nums">{me.wallet}</p>
          <p className="mt-1 opacity-75">{me.wallet === 1 ? "pass ready to use" : "passes ready to use"}. Never expire.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/passes" className="inline-flex items-center gap-2 rounded-full bg-s-invert-fg px-5 py-2.5 text-sm font-semibold text-s-invert transition hover:opacity-90">
              Buy 4 for ₱980
            </Link>
            {me.wallet > 0 ? (
              <Link href="/events" className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold ring-1 ring-current/30 transition hover:bg-white/10">
                Use them
              </Link>
            ) : null}
          </div>
          {me.wallet_history.length ? (
            <ul className="mt-6 grid gap-1.5 border-t border-current/15 pt-4 text-sm">
              {me.wallet_history.slice(0, 4).map((w, i) => (
                <li key={i} className="flex justify-between gap-3 opacity-80">
                  <span className="truncate">
                    {WALLET_KIND[w.kind] ?? w.kind}, {shortDate(w.at)}
                  </span>
                  <span className="tabular-nums font-semibold">
                    {w.delta > 0 ? "+" : ""}
                    {w.delta}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Next up */}
        <section className="lg:col-span-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-7">
          <p className="text-sm font-semibold text-s-muted">Next up</p>
          {next ? (
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <DateTile iso={next[0].event_date} big />
              <div className="min-w-0 flex-1">
                <p className="font-display text-3xl font-semibold tracking-[-0.03em] text-s-fg">{next[0].event_name}</p>
                <p className="mt-2 flex items-center gap-2 text-s-muted">
                  <CalendarBlank className="w-4 h-4" />
                  {fmtEventDate(next[0].event_date, "short")}
                  {timeRange(next[0]) ? `, ${timeRange(next[0])}` : ""}
                </p>
                {next[0].venue ? (
                  <p className="mt-1 flex items-center gap-2 text-s-muted">
                    <MapPinLine className="w-4 h-4" /> {next[0].venue}
                  </p>
                ) : null}
                <p className="mt-3 text-sm font-semibold text-s-fg">
                  {next.length} {next.length === 1 ? "pass" : "passes"}: {next.map((p) => (p.for_me ? "you" : p.holder ?? "a friend")).join(", ")}
                  {!next[0].verified ? <span className="font-normal text-s-muted"> (payment being checked)</span> : null}
                </p>
              </div>
              {next[0].receipt_token ? (
                <Btn href={`/shop/order/${next[0].receipt_token}`} arrow>
                  Show QR
                </Btn>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-[40ch] text-s-fg">Nothing booked yet. Badminton, pickleball and volleyball nights are on the events page.</p>
              <Btn href="/events" arrow>
                Find an event
              </Btn>
            </div>
          )}
        </section>

        {/* Standing */}
        <section className="lg:col-span-12 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-s-muted">
              <TrophyLine className="w-4 h-4" /> Your standing · {seasonName(season)}
            </p>
            <Link href="/leaderboard" className="text-sm font-semibold text-s-fg underline underline-offset-4">
              Full leaderboard
            </Link>
          </div>
          {standings.length === 0 ? (
            <p className="mt-4 text-s-fg">No ranked games yet this season. Play a Rally &amp; Rank or Spike &amp; Chill night to get on the board.</p>
          ) : (
            <ul className="mt-5 grid gap-4 md:grid-cols-2">
              {standings.map((s) => {
                const mine = sortBadges(badges.filter((b) => b.sport === s.sport && b.player_id === s.player_id && (b.season === season || b.badge === "champion")));
                return (
                  <li key={s.sport} className="rounded-[22px] bg-s-sunken p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-s-fg">{SPORT_LABEL[s.sport] ?? s.sport}</p>
                      <p className="text-sm text-s-muted tabular-nums">
                        {s.events} event{s.events === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="mt-3 flex items-end gap-6">
                      <p className="font-display text-5xl font-semibold tracking-[-0.04em] text-s-fg tabular-nums">
                        #{s.rank}
                        <span className="ml-1 text-base font-semibold text-s-muted">of {s.of}</span>
                      </p>
                      <dl className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <dt className="text-s-muted">LP</dt>
                          <dd className="font-semibold tabular-nums text-s-fg">{Number(s.lp).toFixed(2)}</dd>
                        </div>
                        <div>
                          <dt className="text-s-muted">Won</dt>
                          <dd className="font-semibold tabular-nums text-s-fg">
                            {s.wins}/{s.matches}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-s-muted">Rating</dt>
                          <dd className="font-semibold tabular-nums text-s-fg">{Number(s.rating).toFixed(s.sport === "volleyball" ? 3 : 2)}</dd>
                        </div>
                      </dl>
                    </div>
                    {mine.length ? (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {mine.map((b) => (
                          <Badge key={b.badge + b.detail} badge={b.badge} detail={b.detail} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Passes */}
        <section className="lg:col-span-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-7">
          <p className="flex items-center gap-2 text-sm font-semibold text-s-muted">
            <TicketLine className="w-4 h-4" /> Upcoming passes
          </p>
          {groups.length === 0 ? (
            <p className="mt-4 text-s-muted">No upcoming passes.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {groups.map((group) => {
                const p = group[0];
                return (
                  <li key={`${p.event_date}-${p.code}`}>
                    <Link
                      href={p.receipt_token ? `/shop/order/${p.receipt_token}` : p.event_slug ? `/events/${p.event_slug}` : "/events"}
                      className="group flex items-center gap-4 rounded-[20px] p-3 transition hover:bg-s-line/[0.03]"
                    >
                      <DateTile iso={p.event_date} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-s-fg">{p.event_name}</p>
                        <p className="truncate text-sm text-s-muted">
                          {fmtEventDate(p.event_date, "short")}
                          {timeRange(p) ? `, ${timeRange(p)}` : ""}
                          {p.venue ? `. ${p.venue}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-s-fg/80">
                          {group.map((g) => `${g.sport} for ${g.for_me ? "you" : g.holder ?? "a friend"}`).join(" · ")}
                          {!group.some((g) => g.booked_by_me) ? " · booked for you by a friend" : ""}
                        </p>
                      </div>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-s-line/[0.06] text-s-fg transition group-hover:bg-s-invert group-hover:text-s-invert-fg">
                        <ArrowUpRightLine className="w-4 h-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {past.length ? (
            <>
              <p className="mt-6 text-sm font-semibold text-s-muted">Played</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {past.slice(0, 18).map((p) => (
                  <li key={p.code} className="rounded-full bg-s-sunken px-3.5 py-1.5 text-sm text-s-fg">
                    {p.event_name}, {shortDate(p.event_date)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {/* Details */}
        <aside className="lg:col-span-4 lg:row-span-2">
          <Panel>
            <h2 className="font-semibold text-s-fg">Your details</h2>
            <p className="mt-1 text-sm text-s-muted">Used to fill in checkout for you.</p>
            <ProfileForm fullName={me.full_name ?? ""} phone={me.phone ?? ""} />
            <div className="mt-6 border-t border-s-line/[0.08] pt-5">
              <SignOutButton />
            </div>
          </Panel>
        </aside>

        {/* Orders */}
        <section className="lg:col-span-8 rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-7">
          <p className="flex items-center gap-2 text-sm font-semibold text-s-muted">
            <PackageLine className="w-4 h-4" /> Juice orders
          </p>
          {me.orders.length === 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <p className="text-s-muted">No juice orders yet.</p>
              <Btn href="/shop" variant="quiet">
                Shop packs
              </Btn>
            </div>
          ) : (
            <ul className="mt-3">
              {me.orders.map((o, i) => (
                <li key={o.reference} className={i > 0 ? "border-t border-s-line/[0.06]" : ""}>
                  <Link href={`/shop/order/${o.receipt_token}`} className="flex items-center gap-4 py-3.5 transition hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-s-fg">{o.items.map((x) => x.name).join(", ")}</p>
                      <p className="text-sm text-s-muted">
                        {o.reference}, ordered {shortDate(o.created_at)}
                        {o.status === "rejected" ? ". Cancelled" : o.next_delivery ? `. Next delivery ${shortDate(o.next_delivery)}` : ". Delivered"}
                      </p>
                    </div>
                    <span className="tabular-nums font-semibold text-s-fg">{formatPHP(o.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
