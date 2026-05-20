"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { accountEmoji } from "../account-icons";

export type ReimbursementRow = {
  id: string;
  external_id: string | null;
  created_at: string;
  type: "general" | "transfer" | "reimbursement";
  purpose: string;
  payee: string | null;
  category: string | null;
  amount: number | string;
  account_code: string | null;
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

const STATUS_TONE: Record<ReimbursementRow["status"], string> = {
  pending: "bg-yellowBg text-yellow",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPaidThisMonth(r: ReimbursementRow): boolean {
  if (r.status !== "paid" || !r.paid_date) return false;
  const d = new Date(`${r.paid_date}T00:00:00+08:00`);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isInTab(r: ReimbursementRow, tab: TabKey): boolean {
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

export function ReimbursementsList({
  role,
  accounts,
  allowedAccounts,
  initial,
}: {
  role: Role;
  accounts: Array<{ code: string; name: string }>;
  allowedAccounts: Array<{ code: string; name: string }>;
  initial: ReimbursementRow[];
}) {
  const [rows, setRows] = React.useState<ReimbursementRow[]>(initial);
  const [tab, setTab] = React.useState<TabKey>("pending");
  const [payingRow, setPayingRow] = React.useState<ReimbursementRow | null>(null);

  // Per matrix + 20260518130000 migration: owner + partner can pay reimbursements.
  const canPay = role === "owner" || role === "partner";

  React.useEffect(() => {
    setRows(initial);
  }, [initial]);

  const refetch = React.useCallback(async () => {
    const supabase = createClient();
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 12);
    windowStart.setDate(1);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, external_id, created_at, type, purpose, payee, category, amount, account_code, status, paid_date, requested_by_name, notes",
      )
      .eq("type", "reimbursement")
      .is("deleted_at", null)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false });
    setRows((data ?? []) as ReimbursementRow[]);
  }, []);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("finance-reimbursements-list")
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

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-28">Created</th>
              <th className="px-4 py-2 font-semibold w-32">Ref</th>
              <th className="px-4 py-2 font-semibold w-32">Person</th>
              <th className="px-4 py-2 font-semibold w-32">Category</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
              <th className="px-4 py-2 font-semibold w-32">Paid from</th>
              <th className="px-4 py-2 font-semibold w-24">Status</th>
              <th className="px-4 py-2 font-semibold w-20 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No reimbursements in this tab.
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
                  <td className="px-4 py-2.5 text-ink">{r.payee || "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{r.category || "—"}</td>
                  <td className="px-4 py-2.5 truncate" title={r.purpose}>
                    <Link
                      href={`/dashboard/finance/payments/${r.id}`}
                      className="text-ink hover:text-berry block truncate"
                    >
                      {r.purpose}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-coral tabular-nums">
                    {formatPHP(r.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.account_code ? (
                      <>
                        <span aria-hidden className="mr-1">
                          {accountEmoji(r.account_code)}
                        </span>
                        {accountNameByCode[r.account_code] ?? r.account_code}
                      </>
                    ) : (
                      <span className="text-inkSoft italic">— picked at pay</span>
                    )}
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
                  <td className="px-4 py-2.5 text-right">
                    {canPay && r.status === "pending" ? (
                      <Button
                        size="sm"
                        onClick={() => setPayingRow(r)}
                        className="min-h-[36px]"
                      >
                        Pay →
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Window: rolling 12 months. Role: {role}. Owner and Partner can pay reimbursements;
        the chosen company account is recorded only at pay time.
      </p>

      {payingRow ? (
        <PayReimbursementModal
          row={payingRow}
          allowedAccounts={allowedAccounts}
          onClose={() => setPayingRow(null)}
        />
      ) : null}
    </div>
  );
}

function PayReimbursementModal({
  row,
  allowedAccounts,
  onClose,
}: {
  row: ReimbursementRow;
  allowedAccounts: Array<{ code: string; name: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [accountCode, setAccountCode] = React.useState<string>(
    row.account_code ?? allowedAccounts[0]?.code ?? "",
  );
  const [paidDate, setPaidDate] = React.useState(todayIso());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    if (submitting) return;
    if (!accountCode) {
      setError("Pick the company account that's paying this back.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("pay_payment", {
      p_payment_id: row.id,
      p_paid_date: paidDate,
      p_account_code: accountCode,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const accountName =
      allowedAccounts.find((a) => a.code === accountCode)?.name ?? accountCode;
    toast.push(
      `✓ Paid back ${formatPHP(row.amount)} to ${row.payee ?? "—"} from ${accountName}. Logged as expense.`,
      "success",
    );
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={`Pay back ${formatPHP(row.amount)} to ${row.payee ?? "—"} for "${row.purpose}"`}
      description="Choose which company account is paying this back. A matching expense row is created automatically."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || !accountCode}>
            {submitting ? "Posting…" : "Confirm & Pay →"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="rb_pay_account" required>
            Which company account is paying this back?
          </Label>
          {allowedAccounts.length === 0 ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
              You don&rsquo;t have access to any accounts. Ask the owner to grant access.
            </p>
          ) : (
            <Select
              id="rb_pay_account"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              disabled={submitting}
            >
              <option value="">— pick an account —</option>
              {allowedAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
          <p className="text-[11px] text-inkSoft">
            Only accounts you have access to are listed.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rb_pay_date" required>
            Paid date
          </Label>
          <DateInput
            id="rb_pay_date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
            disabled={submitting}
          />
        </div>

        <ul className="text-xs text-inkSoft bg-cream/40 border border-border rounded-md px-3 py-2 list-disc list-inside space-y-1">
          <li>Marks the reimbursement as Paid.</li>
          <li>Posts an outflow from the chosen account.</li>
          <li>Creates a matching Expense record automatically.</li>
        </ul>

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
