"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { accountEmoji } from "../account-icons";

export type PaymentRow = {
  id: string;
  external_id: string | null;
  created_at: string;
  type: "general" | "transfer" | "reimbursement";
  purpose: string;
  payee: string | null;
  category: string | null;
  amount: number | string;
  account_code: string;
  transfer_to_account_code: string | null;
  status: "pending" | "paid" | "cancelled";
  paid_date: string | null;
  requested_by_name: string | null;
  notes: string | null;
};

type TabKey = "all" | "pending" | "paid_month" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "paid_month", label: "Paid this month" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<PaymentRow["status"], string> = {
  pending: "bg-yellowBg text-yellow",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

function isPaidThisMonth(r: PaymentRow): boolean {
  if (r.status !== "paid" || !r.paid_date) return false;
  const d = new Date(`${r.paid_date}T00:00:00+08:00`);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isInTab(r: PaymentRow, tab: TabKey): boolean {
  switch (tab) {
    case "pending":
      return r.status === "pending";
    case "paid_month":
      return isPaidThisMonth(r);
    case "cancelled":
      return r.status === "cancelled";
    case "all":
    default:
      return true;
  }
}

export function PaymentsList({
  role,
  accounts,
  initial,
}: {
  role: Role;
  accounts: Array<{ code: string; name: string }>;
  initial: PaymentRow[];
}) {
  const [rows, setRows] = React.useState<PaymentRow[]>(initial);
  const [tab, setTab] = React.useState<TabKey>("pending");

  React.useEffect(() => {
    setRows(initial);
  }, [initial]);

  // Realtime: refetch on any change to payments (filtered to non-reimbursement).
  const refetch = React.useCallback(async () => {
    const supabase = createClient();
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 12);
    windowStart.setDate(1);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, external_id, created_at, type, purpose, payee, category, amount, account_code, transfer_to_account_code, status, paid_date, requested_by_name, notes",
      )
      .in("type", ["general", "transfer"])
      .is("deleted_at", null)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false });
    setRows((data ?? []) as PaymentRow[]);
  }, []);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("finance-payments-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const accountNameByCode: Record<string, string> = {};
  for (const a of accounts) accountNameByCode[a.code] = a.name;

  const counts: Record<TabKey, number> = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    paid_month: rows.filter(isPaidThisMonth).length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
  };

  const filtered = rows.filter((r) => isInTab(r, tab));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border -mx-6 px-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap inline-flex items-center gap-1.5",
              tab === t.key
                ? "text-berry border-berry"
                : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {t.label}
            <span
              className={cn(
                "text-[10px] font-mono rounded-full px-1.5 py-0.5",
                tab === t.key ? "bg-berryBg text-berry" : "bg-cream text-inkSoft",
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-28">Created</th>
              <th className="px-4 py-2 font-semibold w-32">Ref</th>
              <th className="px-4 py-2 font-semibold w-24">Type</th>
              <th className="px-4 py-2 font-semibold">Purpose</th>
              <th className="px-4 py-2 font-semibold w-40">Payee / Dest.</th>
              <th className="px-4 py-2 font-semibold w-32">From</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
              <th className="px-4 py-2 font-semibold w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No payments in this tab.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                  <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono">
                    <Link
                      href={`/dashboard/finance/payments/${r.id}`}
                      className="text-ink hover:text-berry"
                    >
                      {r.external_id ?? r.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs capitalize text-inkSoft">{r.type}</td>
                  <td className="px-4 py-2.5 truncate" title={r.purpose}>
                    <Link
                      href={`/dashboard/finance/payments/${r.id}`}
                      className="text-ink hover:text-berry block truncate"
                    >
                      {r.purpose}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink">
                    {r.type === "transfer" && r.transfer_to_account_code ? (
                      <span>
                        <span aria-hidden className="mr-1">
                          {accountEmoji(r.transfer_to_account_code)}
                        </span>
                        {accountNameByCode[r.transfer_to_account_code] ?? r.transfer_to_account_code}
                      </span>
                    ) : (
                      r.payee || "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span aria-hidden className="mr-1">{accountEmoji(r.account_code)}</span>
                    {accountNameByCode[r.account_code] ?? r.account_code}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-coral tabular-nums">
                    {formatPHP(r.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                        STATUS_TONE[r.status],
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Window: rolling 12 months. Role: {role}. Live counts update via Supabase realtime.
      </p>
    </div>
  );
}
