"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import { accountEmoji } from "../../account-icons";

export type PaymentDetail = {
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
  paid_at: string | null;
  paid_date: string | null;
  requested_by_user_id: string | null;
  requested_by_name: string | null;
  ledger_entry_id_out: string | null;
  ledger_entry_id_in: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
};

export type LedgerLink = {
  id: string;
  occurred_at: string;
  account_code: string;
  direction: "in" | "out";
  amount: number | string;
  description: string | null;
  ref_external_id: string | null;
};

const STATUS_TONE: Record<PaymentDetail["status"], string> = {
  pending: "bg-yellowBg text-yellow",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PaymentDetailClient({
  role,
  currentUserId,
  payment,
  accounts,
  ledgerEntries,
  linkedExpense,
}: {
  role: Role;
  currentUserId: string;
  payment: PaymentDetail;
  accounts: Array<{ code: string; name: string }>;
  ledgerEntries: LedgerLink[];
  linkedExpense: { id: string; external_id: string | null; category: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();

  // Per access matrix: only owner can pay or cancel payments. Staff can
  // additionally cancel their own pending reimbursements (RLS-gated UPDATE).
  const canPay = role === "owner" && payment.status === "pending";
  const isOwnReimbursement =
    payment.type === "reimbursement" && payment.requested_by_user_id === currentUserId;
  const canCancel =
    payment.status === "pending" &&
    (role === "owner" || (role === "staff" && isOwnReimbursement));

  const accountNameByCode: Record<string, string> = {};
  for (const a of accounts) accountNameByCode[a.code] = a.name;

  const [showPay, setShowPay] = React.useState(false);
  const [paidDate, setPaidDate] = React.useState(todayIso());
  const [paying, setPaying] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);

  const [showCancel, setShowCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  async function handlePay() {
    if (paying) return;
    setPaying(true);
    setPayError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("pay_payment", {
      p_payment_id: payment.id,
      p_paid_date: paidDate,
    });
    setPaying(false);
    if (error) {
      setPayError(error.message);
      return;
    }
    toast.push("Payment marked paid · ledger updated", "success");
    setShowPay(false);
    router.refresh();
  }

  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    setCancelError(null);
    const supabase = createClient();
    let error: { message: string } | null = null;
    if (role === "staff") {
      // cancel_payment RPC requires admin/manager; the staff-reimbursement
      // migration grants direct UPDATE via RLS for own pending rows instead.
      const { error: e } = await supabase
        .from("payments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by_user_id: currentUserId,
          cancel_reason: cancelReason.trim() || null,
        })
        .eq("id", payment.id);
      error = e;
    } else {
      const { error: e } = await supabase.rpc("cancel_payment", {
        p_payment_id: payment.id,
        p_reason: cancelReason.trim() || null,
      });
      error = e;
    }
    setCancelling(false);
    if (error) {
      setCancelError(error.message);
      return;
    }
    toast.push("Payment cancelled", "success");
    setShowCancel(false);
    router.refresh();
  }

  const isTransfer = payment.type === "transfer";
  const isReimb = payment.type === "reimbursement";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">
              {isTransfer ? "🔁" : isReimb ? "🤝" : "💸"}
            </span>
            {payment.purpose}
          </h1>
          <div className="flex items-center gap-2 text-sm text-inkSoft mt-1">
            <span className="font-mono">{payment.external_id ?? payment.id.slice(0, 8)}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                STATUS_TONE[payment.status],
              )}
            >
              {payment.status}
            </span>
            <span className="capitalize">· {payment.type}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canCancel ? (
            <Button variant="dangerGhost" onClick={() => setShowCancel(true)}>
              Cancel
            </Button>
          ) : null}
          {canPay ? <Button onClick={() => setShowPay(true)}>Mark paid</Button> : null}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-border rounded-lg shadow-card p-5 space-y-3 text-sm">
          <Row label="Amount" value={<span className="font-mono text-coral text-lg">{formatPHP(payment.amount)}</span>} />
          <Row
            label="From"
            value={
              <span>
                <span aria-hidden className="mr-1">{accountEmoji(payment.account_code)}</span>
                {accountNameByCode[payment.account_code] ?? payment.account_code}
              </span>
            }
          />
          {isTransfer && payment.transfer_to_account_code ? (
            <Row
              label="To"
              value={
                <span>
                  <span aria-hidden className="mr-1">
                    {accountEmoji(payment.transfer_to_account_code)}
                  </span>
                  {accountNameByCode[payment.transfer_to_account_code] ?? payment.transfer_to_account_code}
                </span>
              }
            />
          ) : null}
          {!isTransfer && payment.payee ? <Row label="Payee" value={payment.payee} /> : null}
          {payment.category ? <Row label="Category" value={payment.category} /> : null}
          {payment.notes ? <Row label="Notes" value={payment.notes} /> : null}
          {payment.requested_by_name ? (
            <Row label="Requested by" value={payment.requested_by_name} />
          ) : null}

          {linkedExpense ? (
            <Row
              label="Linked expense"
              value={
                <Link
                  href={`/dashboard/finance/expenses?highlight=${linkedExpense.id}`}
                  className="text-berry hover:underline"
                >
                  ✓ Logged as {linkedExpense.external_id ?? "expense"} ({linkedExpense.category})
                </Link>
              }
            />
          ) : null}
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-5 space-y-3 text-sm">
          <h2 className="font-serif font-bold text-lg text-ink">Timeline</h2>
          <Step
            label="Requested"
            stamp={payment.created_at}
            actor={payment.requested_by_name ?? "—"}
            active
          />
          {payment.status === "paid" ? (
            <Step
              label="Paid"
              stamp={payment.paid_at}
              actor={`Paid date: ${payment.paid_date ? formatDate(payment.paid_date) : "—"}`}
              active
              tone="success"
            />
          ) : null}
          {payment.status === "cancelled" ? (
            <Step
              label="Cancelled"
              stamp={payment.cancelled_at}
              actor={payment.cancel_reason ?? "No reason given"}
              active
              tone="danger"
            />
          ) : null}
          {payment.status === "pending" ? (
            <Step label="Awaiting payment" stamp={null} actor="—" tone="muted" />
          ) : null}
        </div>
      </div>

      <section>
        <h2 className="font-serif font-bold text-lg text-ink mb-3">Linked ledger entries</h2>
        {ledgerEntries.length === 0 ? (
          <p className="text-sm text-inkSoft">No ledger entries yet — pending payments don&rsquo;t post.</p>
        ) : (
          <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream text-inkSoft">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold w-32">When</th>
                  <th className="px-4 py-2 font-semibold w-40">Account</th>
                  <th className="px-4 py-2 font-semibold">Description</th>
                  <th className="px-4 py-2 font-semibold w-12 text-center">Dir</th>
                  <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {formatDate(e.occurred_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span aria-hidden className="mr-1">
                        {accountEmoji(e.account_code)}
                      </span>
                      {accountNameByCode[e.account_code] ?? e.account_code}
                    </td>
                    <td className="px-4 py-2.5 truncate">{e.description ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      {e.direction === "in" ? (
                        <ArrowDownLeft className="w-4 h-4 inline text-berry" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 inline text-coral" />
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono font-semibold tabular-nums",
                        e.direction === "in" ? "text-berry" : "text-coral",
                      )}
                    >
                      {e.direction === "in" ? "+" : "−"}
                      {formatPHP(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={showPay}
        onClose={paying ? () => {} : () => setShowPay(false)}
        title="Mark payment paid"
        description={`Pay ${formatPHP(payment.amount)} from ${accountNameByCode[payment.account_code] ?? payment.account_code}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPay(false)} disabled={paying}>
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={paying}>
              {paying ? "Posting…" : "Confirm pay"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="paid_date" required>
              Paid date
            </Label>
            <DateInput
              id="paid_date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              disabled={paying}
            />
          </div>
          <p className="text-xs text-inkSoft">
            This posts the ledger entry{isTransfer ? " (both legs for transfers)" : ""} and marks
            the payment <span className="font-mono">paid</span>. This action cannot be cancelled
            via the UI once posted.
          </p>
          {payError ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
              {payError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={showCancel}
        onClose={cancelling ? () => {} : () => setShowCancel(false)}
        title="Cancel payment request"
        description="Pending payments can be cancelled without ledger impact."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCancel(false)} disabled={cancelling}>
              Back
            </Button>
            <Button variant="dangerGhost" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? "Cancelling…" : "Confirm cancel"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cancel_reason">Reason</Label>
            <Textarea
              id="cancel_reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              disabled={cancelling}
            />
          </div>
          {cancelError ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
              {cancelError}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-start">
      <dt className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft pt-0.5">
        {label}
      </dt>
      <dd className="text-ink break-words">{value}</dd>
    </div>
  );
}

function Step({
  label,
  stamp,
  actor,
  active,
  tone = "default",
}: {
  label: string;
  stamp: string | null;
  actor: string;
  active?: boolean;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  const dotTone =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "danger"
        ? "bg-coral"
        : tone === "muted"
          ? "bg-cream border border-border"
          : active
            ? "bg-berry"
            : "bg-cream border border-border";
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className={cn("w-3 h-3 rounded-full mt-1.5 shrink-0", dotTone)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink">{label}</div>
        <div className="text-xs text-inkSoft">{formatStamp(stamp)}</div>
        <div className="text-xs text-inkSoft truncate">{actor}</div>
      </div>
    </div>
  );
}
