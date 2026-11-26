"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { accountEmoji } from "../account-icons";
import { PagerPublisher } from "@/components/pager-publisher";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export type PaymentRow = {
  id: string;
  external_id: string | null;
  created_at: string;
  type: "general" | "transfer" | "reimbursement";
  purpose: string;
  payee: string | null;
  category: string | null;
  amount: number | string;
  account_code: string | null;
  transfer_to_account_code: string | null;
  status: "pending" | "approved" | "paid" | "cancelled";
  paid_date: string | null;
  purchase_date: string | null;
  requested_by_name: string | null;
  notes: string | null;
};

type TabKey = "all" | "pending" | "approved" | "paid_month" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending approval" },
  { key: "approved", label: "Approved · ready to pay" },
  { key: "paid_month", label: "Paid this month" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<PaymentRow["status"], string> = {
  pending: "bg-yellowBg text-yellow",
  approved: "bg-periBg text-peri",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

const STATUS_LABEL: Record<PaymentRow["status"], string> = {
  pending: "pending approval",
  approved: "approved",
  paid: "paid",
  cancelled: "cancelled",
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
    case "approved":
      return r.status === "approved";
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
  allowedAccounts = [],
  initial,
}: {
  role: Role;
  accounts: Array<{ code: string; name: string }>;
  allowedAccounts?: Array<{ code: string; name: string }>;
  initial: PaymentRow[];
}) {
  const toast = useToast();
  const [rows, setRows] = React.useState<PaymentRow[]>(initial);
  const [tab, setTab] = React.useState<TabKey>("pending");

  // Bulk selection (owner/partner, on the Pending and Approved queues only).
  const canBulk = role === "owner" || role === "partner";
  const bulkTab = tab === "pending" || tab === "approved";
  const showSelect = canBulk && bulkTab;
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [fallbackAccount, setFallbackAccount] = React.useState<string>(allowedAccounts[0]?.code ?? "");
  const [showPayModal, setShowPayModal] = React.useState(false);
  const [bulkPaidDate, setBulkPaidDate] = React.useState<string>(new Date().toISOString().slice(0, 10));

  React.useEffect(() => {
    setRows(initial);
  }, [initial]);

  // Clear selection whenever the tab changes.
  React.useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  // Realtime: refetch on any change to payments (filtered to non-reimbursement).
  const refetch = React.useCallback(async () => {
    const supabase = createClient();
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 12);
    windowStart.setDate(1);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, external_id, created_at, type, purpose, payee, category, amount, account_code, transfer_to_account_code, status, paid_date, purchase_date, requested_by_name, notes",
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
    approved: rows.filter((r) => r.status === "approved").length,
    paid_month: rows.filter(isPaidThisMonth).length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
  };

  const filtered = rows.filter((r) => isInTab(r, tab));

  // Rows that can be bulk-acted on in the current tab.
  const selectableIds = showSelect ? filtered.map((r) => r.id) : [];
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const selectedIds = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  async function runBulkApprove() {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("approve_payments_bulk", {
      p_ids: selectedIds,
      p_account_code: fallbackAccount || null,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    const res = (data ?? {}) as { ok?: number; failed?: number };
    toast.push(
      `Approved ${res.ok ?? 0} payment${(res.ok ?? 0) === 1 ? "" : "s"}` +
        (res.failed ? ` · ${res.failed} skipped` : ""),
      res.failed ? "error" : "success",
    );
    setSelected(new Set());
    refetch();
  }

  async function runBulkPay() {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("pay_payments_bulk", {
      p_ids: selectedIds,
      p_paid_date: bulkPaidDate,
    });
    setBusy(false);
    if (error) return toast.push(error.message, "error");
    const res = (data ?? {}) as { ok?: number; failed?: number };
    toast.push(
      `Paid ${res.ok ?? 0} payment${(res.ok ?? 0) === 1 ? "" : "s"}` +
        (res.failed ? ` · ${res.failed} skipped` : ""),
      res.failed ? "error" : "success",
    );
    setShowPayModal(false);
    setSelected(new Set());
    refetch();
  }

  // CTA copy per (status, role) — the detail page hosts the actual modals.
  function ctaForRow(r: PaymentRow): string | null {
    if (r.status === "pending") {
      if (role === "owner" || role === "partner") return "Review →";
      if (role === "manager") return "Open →";
    }
    if (r.status === "approved") {
      if (role === "owner" || role === "partner") return "Pay →";
      return "Open →";
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <PagerPublisher entity="payments" segments={filtered.map((r) => r.id)} />
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

      {showSelect && selectedIds.length > 0 ? (
        <div className="sticky top-14 lg:top-0 z-10 flex flex-wrap items-center gap-3 bg-berry text-white rounded-lg shadow-card px-4 py-3">
          <span className="font-semibold text-sm">
            {selectedIds.length} selected
          </span>
          {tab === "pending" ? (
            <>
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-xs text-white/85 whitespace-nowrap">
                  Pay from (if unset):
                </label>
                <select
                  value={fallbackAccount}
                  onChange={(e) => setFallbackAccount(e.target.value)}
                  disabled={busy}
                  className="text-sm rounded-md border border-white/30 bg-white/10 text-white px-2 py-1 [&>option]:text-ink"
                >
                  <option value="">— each request's own —</option>
                  {allowedAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={runBulkApprove}
                disabled={busy}
              >
                {busy ? "Approving…" : `Approve ${selectedIds.length} →`}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPayModal(true)}
              disabled={busy}
              className="ml-auto"
            >
              {`Pay ${selectedIds.length} →`}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-white/80 hover:text-white underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="hidden md:block bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              {showSelect ? (
                <th className="pl-4 pr-1 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-berry cursor-pointer"
                  />
                </th>
              ) : null}
              <th className="px-4 py-2 font-semibold w-28">Created</th>
              <th className="px-4 py-2 font-semibold w-32">Ref</th>
              <th className="px-4 py-2 font-semibold w-24">Type</th>
              <th className="px-4 py-2 font-semibold">Purpose</th>
              <th className="px-4 py-2 font-semibold w-40">Payee / Dest.</th>
              <th className="px-4 py-2 font-semibold w-32">From</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
              <th className="px-4 py-2 font-semibold w-32">Status</th>
              <th className="px-4 py-2 font-semibold w-24" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={showSelect ? 10 : 9} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No payments in this tab.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const cta = ctaForRow(r);
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t border-border hover:bg-cream/30",
                      selected.has(r.id) && "bg-berryBg/40",
                    )}
                  >
                    {showSelect ? (
                      <td className="pl-4 pr-1 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.external_id ?? r.purpose}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          className="w-4 h-4 accent-berry cursor-pointer"
                        />
                      </td>
                    ) : null}
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
                      {r.purchase_date ? (
                        <span className="block text-[11px] text-inkSoft">
                          bought {formatDate(r.purchase_date)}
                        </span>
                      ) : null}
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
                      {r.account_code ? (
                        <>
                          <span aria-hidden className="mr-1">{accountEmoji(r.account_code)}</span>
                          {accountNameByCode[r.account_code] ?? r.account_code}
                        </>
                      ) : (
                        <span className="text-inkSoft italic">(approver picks)</span>
                      )}
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
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {cta ? (
                        <Link
                          href={`/dashboard/finance/payments/${r.id}`}
                          className="inline-flex items-center gap-1 text-xs text-berry hover:underline whitespace-nowrap"
                        >
                          {cta}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile (sm:-) card list — same data, stacked. */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-lg shadow-card p-6 text-center text-sm text-inkSoft">
            No payments in this tab.
          </div>
        ) : (
          filtered.map((r) => {
            const cta = ctaForRow(r);
            const dest =
              r.type === "transfer" && r.transfer_to_account_code
                ? `${accountEmoji(r.transfer_to_account_code)} ${
                    accountNameByCode[r.transfer_to_account_code] ?? r.transfer_to_account_code
                  }`
                : r.payee;
            return (
              <Link
                key={r.id}
                href={`/dashboard/finance/payments/${r.id}`}
                className="block bg-white border border-border rounded-lg shadow-card p-3 active:bg-cream/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-inkSoft">
                    {r.external_id ?? r.id.slice(0, 8)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                      STATUS_TONE[r.status],
                    )}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="font-semibold text-ink mt-1 line-clamp-2">{r.purpose}</div>
                {dest ? (
                  <div className="text-xs text-inkSoft mt-0.5 truncate">
                    <span className="capitalize">{r.type}</span> · {dest}
                  </div>
                ) : (
                  <div className="text-xs text-inkSoft mt-0.5 capitalize">{r.type}</div>
                )}
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-inkSoft">{formatDate(r.created_at)}</span>
                  <span className="font-serif font-bold text-base text-coral tabular-nums">
                    {formatPHP(r.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-inkSoft truncate">
                    {r.account_code ? (
                      <>
                        From <span aria-hidden className="mx-0.5">{accountEmoji(r.account_code)}</span>
                        {accountNameByCode[r.account_code] ?? r.account_code}
                      </>
                    ) : (
                      <span className="italic">From: approver picks</span>
                    )}
                  </span>
                  {cta ? <span className="text-berry font-semibold">{cta}</span> : null}
                </div>
              </Link>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Window: rolling 12 months. Role: {role}. Live counts update via Supabase realtime.
        Approve / Pay / Cancel actions live on the payment detail page.
        {role === "owner" || role === "partner" ? (
          <span>
            {" "}You and {role === "owner" ? "Partner" : "Owner"} both see Pending and
            Approved tabs for the queue.{" "}
            Tick rows to approve or pay them in one go.
          </span>
        ) : null}
      </p>

      <Modal
        open={showPayModal}
        onClose={busy ? () => {} : () => setShowPayModal(false)}
        title={`Pay ${selectedIds.length} approved payment${selectedIds.length === 1 ? "" : "s"}?`}
        description="Each posts an outflow from the account locked at approval, and creates its expense. Pick the paid date applied to all."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPayModal(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={runBulkPay} disabled={busy}>
              {busy ? "Posting…" : `Pay ${selectedIds.length} →`}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Label htmlFor="bulk_paid_date" required>
            Paid date
          </Label>
          <DateInput
            id="bulk_paid_date"
            value={bulkPaidDate}
            onChange={(e) => setBulkPaidDate(e.target.value)}
            disabled={busy}
          />
        </div>
      </Modal>
    </div>
  );
}

export { ArrowRight };
