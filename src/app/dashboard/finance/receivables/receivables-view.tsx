"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import type { Role } from "@/lib/roles";

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
  paid_amount: number | null;
  paid_date: string | null;
  paid_account_code: string | null;
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

export function ReceivablesView({
  rows,
  role,
  accounts,
}: {
  rows: ReceivableRow[];
  role: Role | null;
  accounts: Array<{ code: string; name: string }>;
}) {
  const canBill = role === "owner";
  const canMarkPaid = role === "owner" || role === "partner";
  const [billOpen, setBillOpen] = React.useState<ReceivableRow | null>(null);
  const [paidOpen, setPaidOpen] = React.useState<ReceivableRow | null>(null);
  const [partnerFilter, setPartnerFilter] = React.useState<string>("");
  // Default: show all statuses. The "All" pill below clears the set; tapping
  // a single status restricts to just that one (toggle-on adds to the set).
  const [statusFilter, setStatusFilter] = React.useState<Set<ReceivableStatus>>(
    new Set(),
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
              <button
                type="button"
                onClick={() => setStatusFilter(new Set())}
                className={cn(
                  "px-2 py-1 text-xs rounded-md border transition",
                  statusFilter.size === 0
                    ? "bg-berry text-white border-berry"
                    : "bg-white text-inkSoft border-border hover:bg-cream",
                )}
              >
                All
              </button>
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

      <div className="hidden md:block bg-white border border-border rounded-lg shadow-card overflow-x-auto">
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
              {(canBill || canMarkPaid) ? (
                <th className="px-4 py-2 font-semibold w-44 text-right">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td
                  colSpan={canBill || canMarkPaid ? 9 : 8}
                  className="px-4 py-8 text-center text-sm text-inkSoft"
                >
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
                const showBillBtn = canBill && r.status === "pending";
                const showPaidBtn = canMarkPaid && r.status === "pending";
                const paidSubtitle =
                  r.status === "paid" && r.paid_account_code && r.paid_date
                    ? `paid via ${accounts.find((a) => a.code === r.paid_account_code)?.name ?? r.paid_account_code} on ${formatDate(r.paid_date)}`
                    : null;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-ink font-semibold">
                      <div>{r.partner_name}</div>
                      {paidSubtitle ? (
                        <div className="text-xs font-normal text-inkSoft mt-0.5">
                          {paidSubtitle}
                        </div>
                      ) : null}
                    </td>
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
                    {(canBill || canMarkPaid) ? (
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {showBillBtn ? (
                            <button
                              type="button"
                              onClick={() => setBillOpen(r)}
                              className="inline-flex items-center rounded-md border border-berryLt bg-white px-2 py-1 text-xs font-semibold text-berry hover:bg-berryBg"
                            >
                              Bill
                            </button>
                          ) : null}
                          {showPaidBtn ? (
                            <button
                              type="button"
                              onClick={() => setPaidOpen(r)}
                              className="inline-flex items-center rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-cream"
                            >
                              Mark paid (cash)
                            </button>
                          ) : null}
                          {!showBillBtn && !showPaidBtn ? (
                            <span className="text-xs text-inkSoft">—</span>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile (sm:-) card list. */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-lg shadow-card p-6 text-center text-sm text-inkSoft">
            No receivables match the current filters.
          </div>
        ) : (
          filtered.map((r) => {
            const overdue = daysOverdue(r.due_date);
            const overdueTone =
              overdue === null || overdue <= 0
                ? "text-inkSoft"
                : overdue <= 30
                  ? "text-yellow"
                  : "text-coral";
            const showBillBtn = canBill && r.status === "pending";
            const showPaidBtn = canMarkPaid && r.status === "pending";
            const paidSubtitle =
              r.status === "paid" && r.paid_account_code && r.paid_date
                ? `paid via ${accounts.find((a) => a.code === r.paid_account_code)?.name ?? r.paid_account_code} on ${formatDate(r.paid_date)}`
                : null;
            return (
              <div
                key={r.id}
                className="block bg-white border border-border rounded-lg shadow-card p-3"
              >
                <Link
                  href={`/dashboard/orders/${r.order_id}`}
                  className="block active:bg-cream/60 -mx-3 -mt-3 px-3 pt-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-inkSoft">
                      {r.order_external_id ?? "—"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        STATUS_TONE[r.status],
                      )}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <div className="font-semibold text-ink mt-1 truncate">
                    {r.partner_name}
                  </div>
                  {paidSubtitle ? (
                    <div className="text-xs text-inkSoft mt-0.5">{paidSubtitle}</div>
                  ) : null}
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-inkSoft">
                      {r.due_date ? `Due ${formatDate(r.due_date)}` : `Created ${formatDate(r.created_at)}`}
                    </span>
                    <span className="font-serif font-bold text-base text-ink tabular-nums">
                      {formatPHP(r.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs">
                    <span className={cn("font-mono", overdueTone)}>
                      {overdue === null || overdue <= 0 ? "On time" : `${overdue}d late`}
                    </span>
                    {r.bill_external_id ? (
                      <span className="font-mono text-inkSoft">
                        Bill {r.bill_external_id}
                      </span>
                    ) : null}
                  </div>
                </Link>
                {(showBillBtn || showPaidBtn) ? (
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    {showBillBtn ? (
                      <Button
                        type="button"
                        variant="berryGhost"
                        size="sm"
                        onClick={() => setBillOpen(r)}
                      >
                        Bill
                      </Button>
                    ) : null}
                    {showPaidBtn ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPaidOpen(r)}
                      >
                        Mark paid (cash)
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <CreateBillModal
        receivable={billOpen}
        onClose={() => setBillOpen(null)}
      />
      <MarkPaidCashModal
        receivable={paidOpen}
        accounts={accounts}
        onClose={() => setPaidOpen(null)}
      />
    </div>
  );
}

function CreateBillModal({
  receivable,
  onClose,
}: {
  receivable: ReceivableRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [billDate, setBillDate] = React.useState(today);
  const [dueDate, setDueDate] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [deliveryFees, setDeliveryFees] = React.useState("0");
  const [discount, setDiscount] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (receivable) {
      setBillDate(today);
      setDueDate(receivable.due_date ?? "");
      setPaymentTerms("");
      setDeliveryFees("0");
      setDiscount("0");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivable]);

  async function submit() {
    if (!receivable) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_bill_for_receivable", {
      p_receivable_id: receivable.id,
      p_bill_date: billDate,
      p_due_date: dueDate || null,
      p_payment_terms: paymentTerms.trim() || null,
      p_delivery_fees: Number(deliveryFees) || 0,
      p_discount: Number(discount) || 0,
      p_notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't draft bill", "error");
      return;
    }
    toast.push("Draft bill created", "success");
    onClose();
    if (data) {
      router.push(`/dashboard/finance/bills/${data as string}`);
    } else {
      router.refresh();
    }
  }

  return (
    <Modal
      open={receivable != null}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Draft bill for receivable"
      description={
        receivable
          ? `${receivable.partner_name} · ${formatPHP(receivable.amount)}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Drafting…" : "Draft bill"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="bdate" required>
              Bill date
            </Label>
            <DateInput
              id="bdate"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ddate">Due date</Label>
            <DateInput
              id="ddate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="bterms">Payment terms</Label>
            <Select
              id="bterms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              disabled={busy}
            >
              <option value="">—</option>
              <option value="net7">Net 7</option>
              <option value="net15">Net 15</option>
              <option value="net30">Net 30</option>
              <option value="cod">Cash on delivery</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bfees">Delivery fees</Label>
            <NumberInput
              id="bfees"
              prefix="₱"
              min="0"
              step="1"
              value={deliveryFees}
              onChange={(e) => setDeliveryFees(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bdisc">Discount</Label>
            <NumberInput
              id="bdisc"
              prefix="₱"
              min="0"
              step="1"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bnotes">Notes</Label>
          <Textarea
            id="bnotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
          />
        </div>
        {receivable ? (
          <p className="text-xs text-inkSoft">
            Bill total will be{" "}
            <span className="font-semibold text-ink">
              {formatPHP(
                receivable.amount +
                  (Number(deliveryFees) || 0) -
                  (Number(discount) || 0),
              )}
            </span>{" "}
            (drafted, not yet issued).
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function MarkPaidCashModal({
  receivable,
  accounts,
  onClose,
}: {
  receivable: ReceivableRow | null;
  accounts: Array<{ code: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [accountCode, setAccountCode] = React.useState(accounts[0]?.code ?? "");
  const [amount, setAmount] = React.useState("0");
  const [paidDate, setPaidDate] = React.useState(today);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (receivable) {
      setAccountCode(accounts[0]?.code ?? "");
      setAmount(String(receivable.amount));
      setPaidDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivable]);

  async function submit() {
    if (!receivable) return;
    const amt = Number(amount);
    if (!accountCode) {
      toast.push("Pick a receiving account", "error");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.push("Amount must be > 0", "error");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_receivable_paid_cash", {
      p_receivable_id: receivable.id,
      p_account_code: accountCode,
      p_amount: amt,
      p_paid_date: paidDate,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't mark paid", "error");
      return;
    }
    toast.push("Receivable marked paid — ledger updated", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={receivable != null}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Mark receivable paid (cash)"
      description={
        receivable
          ? `${receivable.partner_name} · ${formatPHP(receivable.amount)}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Mark paid"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="ract" required>
            Receiving account
          </Label>
          <Select
            id="ract"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            disabled={busy}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ramt" required>
            Amount
          </Label>
          <NumberInput
            id="ramt"
            prefix="₱"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
          {receivable ? (
            <p className="text-xs text-inkSoft">
              Receivable amount: {formatPHP(receivable.amount)}.
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="rdate">Paid date</Label>
          <DateInput
            id="rdate"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  );
}
