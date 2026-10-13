import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { fmtEventDate, timeRange } from "../_components/events";
import { ArrowUpRightLine, PackageLine, TicketLine } from "../_components/icons";
import { Btn, Container, Panel } from "../_components/ui";
import { ProfileForm, SignOutButton } from "./account-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

type Pass = {
  code: string;
  sport: string;
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
  is_staff: boolean;
  full_name: string | null;
  phone: string | null;
  passes: Pass[];
  orders: Order[];
};

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function shortDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: iso.length === 10 ? "UTC" : "Asia/Manila",
  });
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account/login");

  const { data, error } = await supabase.rpc("member_me");
  if (error || !data) redirect("/account/login");
  const me = data as Me;

  const t = today();
  const upcoming = me.passes.filter((p) => p.event_date >= t);
  const past = me.passes.filter((p) => p.event_date < t).reverse();
  // Group upcoming passes by event so a group booking reads as one row.
  const byEvent = new Map<string, Pass[]>();
  for (const p of upcoming) {
    const k = `${p.event_date}|${p.event_name}|${p.receipt_token ?? ""}`;
    byEvent.set(k, [...(byEvent.get(k) ?? []), p]);
  }
  const first = (me.full_name ?? "").split(" ")[0] || null;

  return (
    <Container className="pt-14 md:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display font-semibold tracking-[-0.04em] leading-[1] text-5xl md:text-6xl text-s-fg">
            {first ? `Hi, ${first}.` : "Your account"}
          </h1>
          <p className="mt-3 text-s-muted">{me.email}</p>
        </div>
        {me.is_staff ? (
          <Btn href="/dashboard" variant="quiet">
            Open NJJ OS
          </Btn>
        ) : null}
      </div>

      {!me.email_confirmed ? (
        <div className="mt-8 rounded-[20px] bg-s-brand/25 px-5 py-4 text-s-fg">
          Confirm your email to see your passes and orders. Open the link we emailed to {me.email}.
        </div>
      ) : null}

      <div className="mt-12 grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8 grid gap-8">
          {/* Upcoming passes */}
          <section>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-s-fg">Your passes</h2>
            {byEvent.size === 0 ? (
              <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <p className="text-s-muted">No upcoming passes.</p>
                <Btn href="/events" arrow>
                  Find an event
                </Btn>
              </Panel>
            ) : (
              <ul className="mt-5 grid gap-3">
                {Array.from(byEvent.values()).map((group) => {
                  const p = group[0];
                  return (
                    <li key={`${p.event_date}-${p.code}`}>
                      <Link
                        href={p.receipt_token ? `/shop/order/${p.receipt_token}` : p.event_slug ? `/events/${p.event_slug}` : "/events"}
                        className="group flex items-center gap-5 rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.07] p-4 pr-5 transition duration-300 ease-settle hover:ring-s-line/20"
                      >
                        <div className="w-16 h-16 shrink-0 rounded-[18px] bg-s-brand/30 flex flex-col items-center justify-center">
                          <span className="font-display text-2xl font-semibold leading-none text-s-fg tabular-nums">
                            {new Date(`${p.event_date}T00:00:00Z`).getUTCDate()}
                          </span>
                          <span className="text-[11px] font-semibold text-s-fg/70">
                            {new Date(`${p.event_date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" })}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-s-fg truncate">{p.event_name}</p>
                          <p className="text-sm text-s-muted truncate">
                            {fmtEventDate(p.event_date, "short")}
                            {timeRange(p) ? `, ${timeRange(p)}` : ""}
                            {p.venue ? `. ${p.venue}` : ""}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-s-fg/80">
                            {group.length} {group.length === 1 ? "pass" : "passes"}: {Array.from(new Set(group.map((g) => g.sport))).join(", ")}
                            {!p.verified ? <span className="font-normal text-s-muted"> (payment being checked)</span> : null}
                          </p>
                        </div>
                        <span className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-s-fg">
                          Show QR
                          <span className="w-9 h-9 rounded-full bg-s-line/[0.06] flex items-center justify-center transition group-hover:bg-s-invert group-hover:text-s-invert-fg">
                            <ArrowUpRightLine className="w-4 h-4" />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Orders */}
          <section>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] text-s-fg">Your orders</h2>
            {me.orders.length === 0 ? (
              <Panel className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <p className="text-s-muted">No juice orders yet.</p>
                <Btn href="/shop" arrow>
                  Shop packs
                </Btn>
              </Panel>
            ) : (
              <ul className="mt-5 rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.07]">
                {me.orders.map((o, i) => (
                  <li key={o.reference} className={i > 0 ? "border-t border-s-line/[0.06]" : ""}>
                    <Link href={`/shop/order/${o.receipt_token}`} className="flex items-center gap-4 px-5 py-4 hover:bg-s-line/[0.02] transition">
                      <PackageLine className="w-5 h-5 text-s-muted shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-s-fg truncate">{o.items.map((x) => x.name).join(", ")}</p>
                        <p className="text-sm text-s-muted">
                          {o.reference}, ordered {shortDate(o.created_at)}
                          {o.status === "rejected"
                            ? ". Cancelled"
                            : o.next_delivery
                              ? `. Next delivery ${shortDate(o.next_delivery)}`
                              : ". Delivered"}
                        </p>
                      </div>
                      <span className="tabular-nums font-semibold text-s-fg">{formatPHP(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 ? (
            <section>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-s-fg">Events you&apos;ve played</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {past.slice(0, 24).map((p) => (
                  <li key={p.code} className="inline-flex items-center gap-2 rounded-full bg-s-sunken px-4 py-2 text-sm text-s-fg">
                    <TicketLine className="w-4 h-4 text-s-muted" />
                    {p.event_name}, {shortDate(p.event_date)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Profile */}
        <aside className="lg:col-span-4 lg:sticky lg:top-28">
          <Panel>
            <h2 className="font-semibold text-s-fg">Your details</h2>
            <p className="mt-1 text-sm text-s-muted">Used to fill in checkout for you.</p>
            <ProfileForm fullName={me.full_name ?? ""} phone={me.phone ?? ""} />
            <div className="mt-6 border-t border-s-line/[0.08] pt-5">
              <SignOutButton />
            </div>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
