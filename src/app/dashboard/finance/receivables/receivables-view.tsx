"use client";

import * as React from "react";
import Link from "next/link";
import { Combobox } from "@/components/ui/combobox";
import { cn, formatDate, formatPHP } from "@/lib/utils";

export type ReceivableStatus = "pending" | "billed" | "paid" | "cancelled";

export type ReceivableRow = {
  id: string;
  external_id: string | null;
  created_at: string;
  amount: number;
  status: ReceivableStatus;
  due_date: string | null;
  order_id: string;
  partner_id: string;
  bill_id: string | null;
  partner_name: string;
  order_external_id: string | null;
  bill_external_id: string | null;
};

type AgingBand = "current" | "1-30" | "31-60" | "60+";

const BANDS: { key: AgingBand; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "1-30", label: "1–30 days" },
  { key: "31-60", label: "31–60 days" },
  { key: "60+", label: "60+ days" },
];

const STATUS_LABELS: Record<ReceivableStatus, string> = {
  pending: "Pending",
  billed: "Billed",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<ReceivableStatus, string> = {
  pending: "bg-yellowBg text-yellow",
  billed: "bg-periBg text-peri",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

function daysOverdue(due: string | null): number | null {
  if (!due) return null;
  const dueDate = new Date(`${due}T00:00:00+08:00`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date());
  const today = new Date(`${todayStr}T00:00:00+08:00`);
  return Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
}

function bandFor(due: string | null): AgingBand {
  const d = daysOverdue(due);
  if (d === null || d <= 0) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  return "60+";
}

export function ReceivablesView({ rows }: { rows: ReceivableRow[] }) {
  const [partnerFilter, setPartnerFilter] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<Set<ReceivableStatus>>(
    new Set(["pending", "billed"] as ReceivableStatus[]),
  );
  const [bandFilter, setBandFilter] = React.useState<Set<AgingBand>>(new Set());

  // Outstanding = pending + billed only — these are what aging is about.
  const outstanding = rows.filter((r) => r.status === "pending" || r.status === "billed");
  const aging: Record<AgingBand, { total: number; count: number }> = {
    current: { total: 0, count: 0 },
    "1-30": { total: 0, count: 0 },
    "31-60": { total: 0, count: 0 },
    "60+": { total: 0, count: 0 },
  };
  for (const r of outstanding) {
    const b = bandFor(r.due_date);
    aging[b].total += r.amount;
    aging[b].count += 1;
  }
  const totalOutstanding = outstanding.reduce((s, r) => s + r.amount, 0);

  const partners = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (!m.has(r.partner_id)) m.set(r.partner_id, r.partner_name);
    return Array.from(m.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  function toggleStatus(s: ReceivableStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }
  function toggleBand(b: AgingBand) {
    setBandFilter((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  const filtered = rows.filter((r) => {
    if (partnerFilter && r.partner_id !== partnerFilter) return false;
    if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
    if (bandFilter.size > 0 && !bandFilter.has(bandFor(r.due_date))) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-serif font-bold text-lg text-ink">Aging summary</h2>
          <p className="text-xs text-inkSoft mt-0.5">Outstanding balances by days past due.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
          {BANDS.map((b) => (
            <div key={b.key} className="px-5 py-4">
              <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
                {b.label}
              </div>
              <div className="font-serif font-bold text-2xl text-ink tabular-nums">
                {formatPHP(aging[b.key].total)}
              </div>
              <div className="text-xs text-inkSoft mt-0.5">
                {aging[b.key].count} invoice{aging[b.key].count === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border bg-cream/40 px-5 py-3 flex items-center justify-between text-sm">
          <span className="text-inkSoft">Total outstanding</span>
          <span className="font-serif font-bold text-xl text-berry tabular-nums">
            {formatPHP(totalOutstanding)}
          </span>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem]">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
              Partner
            </div>
            <Combobox
              ariaLabel="Partner"
              value={partnerFilter}
              onChange={setPartnerFilter}
              options={partners}
              placeholder="All partners"
              emptyMessage="No partners with receivables"
            />
          </div>

          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
              Status
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(STATUS_LABELS) as ReceivableStatus[]).map((s) => {
                const on = statusFilter.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md border transition",
                      on
                        ? "bg-berry text-white border-berry"
                        : "bg-white text-inkSoft border-border hover:bg-cream",
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
              Aging
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {BANDS.map((b) => {
                const on = bandFilter.has(b.key);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => toggleBand(b.key)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md border transition",
                      on
                        ? "bg-peri text-white border-peri"
                        : "bg-white text-inkSoft border-border hover:bg-cream",
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-24">Created</th>
              <th className="px-4 py-2 font-semibold">Partner</th>
              <th className="px-4 py-2 font-semibold w-32">Order</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
              <th className="px-4 py-2 font-semibold w-24">Due</th>
              <th className="px-4 py-2 font-semibold w-24 text-right">Days late</th>
              <th className="px-4 py-2 font-semibold w-24">Status</th>
              <th className="px-4 py-2 font-semibold w-32">Bill</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No receivables match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const overdue = daysOverdue(r.due_date);
                const overdueTone =
                  overdue === null
                    ? "text-inkSoft"
                    : overdue <= 0
                      ? "text-inkSoft"
                      : overdue <= 30
                        ? "text-yellow"
                        : "text-coral";
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-ink font-semibold">{r.partner_name}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      {r.order_external_id ? (
                        <Link
                          href={`/dashboard/orders/${r.order_id}`}
                          className="text-ink hover:text-berry"
                        >
                          {r.order_external_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatPHP(r.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {r.due_date ? formatDate(r.due_date) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs ${overdueTone}`}>
                      {overdue === null || overdue <= 0 ? "—" : `${overdue}d`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                          STATUS_TONE[r.status],
                        )}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      {r.bill_external_id ? (
                        <Link
                          href={`/dashboard/finance/bills/${r.bill_id}`}
                          className="text-ink hover:text-berry"
                        >
                          {r.bill_external_id}
                        </Link>
                      ) : (
                        <span className="text-inkSoft">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Creating bills from selected receivables ships in Phase 2 once the bulk RPC is wired.
      </p>
    </div>
  );
}
