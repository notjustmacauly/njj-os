"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Sun,
  CalendarDays,
  MapPin,
  ArrowRight,
  Bell,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPHP } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Fired by the header button to re-open the briefing on demand. */
export const OPEN_BRIEFING_EVENT = "njj:open-briefing";

type TaskLite = { id: string; title: string; board: string; status: string };
type EventLite = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  all_day: boolean;
  location: string | null;
};
type NotifLite = {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  occurred_at: string;
};

type BriefingData = {
  your_day?: {
    events_today?: EventLite[];
    tasks_due_today?: TaskLite[];
    my_open_tasks?: number;
  };
  needs_you?: Record<string, unknown> & {
    for_checking?: TaskLite[];
    overdue_tasks?: number;
  };
  since_last_visit?: {
    new_notifications_count?: number;
    new_notifications?: NotifLite[];
    new_orders?: number;
  };
  watch_outs?: {
    overdue_tasks?: number;
    overdue_receivables?: number;
    unpaid_orders?: number;
    low_stock?: { code: string; name: string; remaining: number; unit: string }[];
  };
  pulse?: {
    show_money?: boolean;
    juice_7d?: number;
    cash_on_hand?: number | null;
    markets_mtd?: number | null;
    markets_yesterday?: number | null;
  };
};

export type Briefing = {
  should_show: boolean;
  is_force?: boolean;
  tier?: "management" | "personal";
  since?: string | null;
  today?: string;
  data?: BriefingData;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  approved: "Approved",
  revise: "Revise",
  scheduled: "Scheduled",
  for_checking: "For Checking",
};

function greeting(): string {
  const h = Number(
    new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }),
  );
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtToday(iso?: string): string {
  const d = iso ? new Date(iso + "T00:00:00+08:00") : new Date();
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fmtEventWhen(e: EventLite): string {
  const d = new Date(e.starts_at);
  if (e.all_day) return "all day";
  return d.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sinceLabel(since?: string | null): string {
  if (!since) return "your last visit";
  const d = new Date(since);
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function CountChip({
  label,
  count,
  hint,
  accent,
  onClick,
}: {
  label: string;
  count: number;
  hint?: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-white border border-border rounded-lg p-3 hover:border-berry hover:shadow-card transition"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-serif font-bold text-2xl tabular-nums", accent)}>{count}</span>
        <ArrowRight className="w-3.5 h-3.5 text-inkSoft opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div className="text-xs font-semibold text-ink mt-0.5">{label}</div>
      {hint ? <div className="text-[11px] text-inkSoft">{hint}</div> : null}
    </button>
  );
}

function PulseTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-border rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-smallcaps font-semibold text-inkSoft">{label}</div>
      <div className="font-serif font-bold text-lg text-ink mt-0.5 tabular-nums">{value}</div>
      {sub ? <div className="text-[11px] text-inkSoft">{sub}</div> : null}
    </div>
  );
}

export function DailyBriefing({ initial, name }: { initial: Briefing | null; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [briefing, setBriefing] = React.useState<Briefing | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Auto-show once per day from the server-provided payload, and record that
  // it was seen (moves the "since last visit" anchor forward).
  React.useEffect(() => {
    if (initial?.should_show && initial.data) {
      setBriefing(initial);
      setOpen(true);
      createClient()
        .rpc("briefing_mark_shown")
        .then(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual re-open from the header button — fetch fresh, don't move the anchor.
  React.useEffect(() => {
    async function onOpen() {
      setLoading(true);
      setOpen(true);
      const { data } = await createClient().rpc("get_daily_briefing", { p_force: true });
      setBriefing((data as unknown as Briefing) ?? null);
      setLoading(false);
    }
    window.addEventListener(OPEN_BRIEFING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BRIEFING_EVENT, onOpen);
  }, []);

  // Escape closes.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const d = briefing?.data;
  const tier = briefing?.tier;
  const isMgmt = tier === "management";

  const yd = d?.your_day;
  const slv = d?.since_last_visit;
  const wo = d?.watch_outs;
  const pulse = d?.pulse;

  const events = yd?.events_today ?? [];
  const tasksToday = yd?.tasks_due_today ?? [];

  // Management "needs you" chips (zero-count ones are hidden to cut noise).
  const needs = (d?.needs_you ?? {}) as Record<string, number>;
  const mgmtChips = isMgmt
    ? (
        [
          { key: "payments_to_approve", label: "Payments to approve", href: "/dashboard/finance/payments", accent: "text-coral", hint: "Awaiting your approval" },
          { key: "approved_to_pay", label: "Approved · to pay out", href: "/dashboard/finance/payments", accent: "text-berry", hint: "Approved, not yet paid" },
          { key: "reimbursements_pending", label: "Reimbursements to pay", href: "/dashboard/finance/reimbursements", accent: "text-peri" },
          { key: "bills_to_pay", label: "Bills to pay", href: "/dashboard/finance/bills", accent: "text-coral" },
          { key: "orders_to_deliver", label: "Orders to deliver", href: "/dashboard/orders", accent: "text-yellow", hint: "Mark delivered when out" },
          { key: "tasks_for_checking", label: "Tasks for checking", href: "/dashboard/tasks", accent: "text-berry" },
        ] as const
      ).filter((c) => (needs[c.key] ?? 0) > 0)
    : [];

  // Watch-outs — only render the ones that are non-zero / non-empty.
  const woItems = isMgmt
    ? (
        [
          { key: "overdue_tasks", label: "Overdue tasks", href: "/dashboard/tasks" },
          { key: "overdue_receivables", label: "Overdue receivables", href: "/dashboard/finance/receivables" },
          { key: "unpaid_orders", label: "Unpaid orders", href: "/dashboard/orders" },
        ] as const
      ).filter((c) => ((wo?.[c.key] as number) ?? 0) > 0)
    : [];
  const lowStock = wo?.low_stock ?? [];
  const hasWatchOuts = woItems.length > 0 || lowStock.length > 0;

  const notifs = slv?.new_notifications ?? [];
  const notifCount = slv?.new_notifications_count ?? 0;
  const newOrders = slv?.new_orders ?? 0;

  const forChecking = (d?.needs_you?.for_checking ?? []) as TaskLite[];
  const personalOverdue = (d?.needs_you?.overdue_tasks as number) ?? 0;

  const showMoney = pulse?.show_money !== false;
  const money = (v: number | null | undefined) =>
    v == null ? "•••" : formatPHP(v);

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Daily briefing"
    >
      <div
        className="relative bg-cream rounded-xl shadow-2xl w-full max-w-lg my-6 border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-br from-berry to-peri text-white rounded-t-xl px-5 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5" />
              <h2 className="font-serif font-bold text-xl">
                {greeting()}, {name}
              </h2>
            </div>
            <p className="text-sm text-white/85 mt-0.5">
              {fmtToday(briefing?.today)} · your daily briefing
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close briefing"
            className="shrink-0 -mr-1 -mt-1 w-9 h-9 flex items-center justify-center rounded-md text-white/80 hover:bg-white/15"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-6">
          {loading && !d ? (
            <p className="text-sm text-inkSoft py-8 text-center">Loading your briefing…</p>
          ) : !d ? (
            <p className="text-sm text-inkSoft py-8 text-center">Nothing to show right now.</p>
          ) : (
            <>
              {/* YOUR DAY */}
              <Section icon={<CalendarDays className="w-3.5 h-3.5" />} title="Your day">
                {events.length === 0 && tasksToday.length === 0 ? (
                  <p className="text-sm text-inkSoft">
                    No events or tasks due today. Clear runway. 🛫
                    {yd?.my_open_tasks ? (
                      <>
                        {" "}
                        <button className="text-berry font-semibold hover:underline" onClick={() => go("/dashboard/tasks")}>
                          {yd.my_open_tasks} open task{yd.my_open_tasks === 1 ? "" : "s"}
                        </button>{" "}
                        overall.
                      </>
                    ) : null}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {events.length > 0 ? (
                      <ul className="space-y-1.5">
                        {events.map((e) => (
                          <li key={e.id}>
                            <button
                              onClick={() => go("/dashboard/calendar")}
                              className="w-full flex items-center justify-between gap-3 text-left group"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-ink group-hover:text-berry">{e.title}</span>
                                {e.location ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-inkSoft">
                                    <MapPin className="w-3 h-3" /> {e.location}
                                  </span>
                                ) : null}
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-berry tabular-nums">{fmtEventWhen(e)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {tasksToday.length > 0 ? (
                      <div>
                        <div className="text-[11px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
                          Due today
                        </div>
                        <ul className="space-y-1">
                          {tasksToday.map((t) => (
                            <li key={t.id}>
                              <button
                                onClick={() => go("/dashboard/tasks")}
                                className="w-full flex items-center justify-between gap-3 text-left group"
                              >
                                <span className="truncate text-sm text-ink group-hover:text-berry">{t.title}</span>
                                <span className="shrink-0 text-xs text-inkSoft">{STATUS_LABEL[t.status] ?? t.status}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </Section>

              {/* NEEDS YOU */}
              {isMgmt ? (
                <Section icon={<CheckCircle2 className="w-3.5 h-3.5" />} title="Needs you">
                  {mgmtChips.length === 0 ? (
                    <p className="text-sm text-inkSoft">Nothing waiting on your approval. 🎉</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {mgmtChips.map((c) => (
                        <CountChip
                          key={c.key}
                          label={c.label}
                          count={needs[c.key] ?? 0}
                          hint={"hint" in c ? (c.hint as string) : undefined}
                          accent={c.accent}
                          onClick={() => go(c.href)}
                        />
                      ))}
                    </div>
                  )}
                </Section>
              ) : (
                <Section icon={<CheckCircle2 className="w-3.5 h-3.5" />} title="Needs you">
                  {forChecking.length === 0 && personalOverdue === 0 ? (
                    <p className="text-sm text-inkSoft">You&apos;re all caught up. 🎉</p>
                  ) : (
                    <div className="space-y-2">
                      {personalOverdue > 0 ? (
                        <button
                          onClick={() => go("/dashboard/tasks")}
                          className="w-full text-left bg-coral/10 border border-coral/30 rounded-lg px-3 py-2 text-sm text-ink hover:border-coral"
                        >
                          <span className="font-semibold text-coral">{personalOverdue}</span> task
                          {personalOverdue === 1 ? "" : "s"} overdue — needs attention
                        </button>
                      ) : null}
                      {forChecking.length > 0 ? (
                        <ul className="space-y-1">
                          {forChecking.map((t) => (
                            <li key={t.id}>
                              <button
                                onClick={() => go("/dashboard/tasks")}
                                className="w-full flex items-center justify-between gap-3 text-left group"
                              >
                                <span className="truncate text-sm text-ink group-hover:text-berry">{t.title}</span>
                                <span className="shrink-0 text-xs font-semibold text-berry">
                                  {STATUS_LABEL[t.status] ?? t.status}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </Section>
              )}

              {/* SINCE LAST VISIT */}
              <Section icon={<Bell className="w-3.5 h-3.5" />} title={`Since ${sinceLabel(briefing?.since)}`}>
                {notifCount === 0 && newOrders === 0 ? (
                  <p className="text-sm text-inkSoft">Nothing new since you were last here.</p>
                ) : (
                  <div className="space-y-2">
                    {isMgmt && newOrders > 0 ? (
                      <button
                        onClick={() => go("/dashboard/orders")}
                        className="w-full text-left bg-white border border-border rounded-lg px-3 py-2 text-sm text-ink hover:border-berry"
                      >
                        <span className="font-semibold text-berry">{newOrders}</span> new order
                        {newOrders === 1 ? "" : "s"} came in
                      </button>
                    ) : null}
                    {notifs.length > 0 ? (
                      <ul className="space-y-1">
                        {notifs.map((n) => (
                          <li key={n.id}>
                            <button
                              onClick={() => go(n.link || "/dashboard")}
                              className="w-full text-left group"
                            >
                              <span className="block truncate text-sm text-ink group-hover:text-berry">{n.title}</span>
                              {n.message ? (
                                <span className="block truncate text-xs text-inkSoft">{n.message}</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                        {notifCount > notifs.length ? (
                          <li className="text-xs text-inkSoft pt-0.5">
                            +{notifCount - notifs.length} more notification{notifCount - notifs.length === 1 ? "" : "s"}
                          </li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                )}
              </Section>

              {/* WATCH-OUTS (management only) */}
              {isMgmt && hasWatchOuts ? (
                <Section icon={<AlertTriangle className="w-3.5 h-3.5 text-coral" />} title="Watch-outs">
                  <div className="space-y-2">
                    {woItems.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {woItems.map((c) => (
                          <button
                            key={c.key}
                            onClick={() => go(c.href)}
                            className="inline-flex items-center gap-1.5 bg-coral/10 border border-coral/30 rounded-full px-3 py-1 text-xs text-ink hover:border-coral"
                          >
                            <span className="font-semibold text-coral tabular-nums">{(wo?.[c.key] as number) ?? 0}</span>
                            {c.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {lowStock.length > 0 ? (
                      <button
                        onClick={() => go("/dashboard/inventory")}
                        className="w-full text-left bg-yellow/10 border border-yellow/40 rounded-lg px-3 py-2 hover:border-yellow"
                      >
                        <div className="text-xs font-semibold text-ink mb-0.5">Running low</div>
                        <ul className="text-xs text-inkSoft space-y-0.5">
                          {lowStock.map((s) => (
                            <li key={s.code} className="flex justify-between gap-2">
                              <span className="truncate">{s.name}</span>
                              <span className="tabular-nums shrink-0">
                                {Number(s.remaining)} {s.unit} left
                              </span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    ) : null}
                  </div>
                </Section>
              ) : null}

              {/* PULSE (management only) */}
              {isMgmt && pulse ? (
                <Section icon={<Activity className="w-3.5 h-3.5" />} title="Pulse">
                  <div className="grid grid-cols-2 gap-2">
                    {showMoney ? (
                      <>
                        <PulseTile label="Cash on hand" value={money(pulse.cash_on_hand)} sub="all accounts" />
                        <PulseTile label="Markets · this month" value={money(pulse.markets_mtd)} sub="POS sales" />
                        <PulseTile label="Markets · yesterday" value={money(pulse.markets_yesterday)} sub="POS sales" />
                      </>
                    ) : null}
                    <PulseTile
                      label="Juice produced"
                      value={`${pulse.juice_7d ?? 0}`}
                      sub="units · last 7 days"
                    />
                  </div>
                </Section>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-inkSoft inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> NJJ OS
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm font-semibold text-berry hover:underline"
          >
            Let&apos;s go →
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small header control that re-opens the briefing on demand. */
export function BriefingButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Open daily briefing"
      title="Daily briefing"
      onClick={() => window.dispatchEvent(new Event(OPEN_BRIEFING_EVENT))}
      className={cn(
        "min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md text-inkSoft hover:text-berry hover:bg-cream touch-manipulation",
        className,
      )}
    >
      <Sun className="w-5 h-5" />
    </button>
  );
}
