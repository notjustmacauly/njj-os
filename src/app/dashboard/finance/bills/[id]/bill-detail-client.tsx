"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import { accountEmoji } from "../../account-icons";

export type BillDetail = {
  id: string;
  external_id: string | null;
  bill_date: string;
  due_date: string | null;
  payment_terms: string | null;
  status: "draft" | "issued" | "paid" | "cancelled";
  subtotal: number;
  delivery_fees: number;
  discount: number;
  total: number;
  paid_amount: number;
  paid_date: string | null;
  paid_account_code: string | null;
  wix_invoice_id: string | null;
  wix_invoice_url: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  partner_id: string;
  partner_name: string;
  partner_external_id: string | null;
};

export type LinkedOrder = {
  receivable_id: string;
  receivable_external_id: string | null;
  receivable_amount: number;
  receivable_status: string;
  order_id: string | null;
  order_external_id: string | null;
  order_date: string | null;
  order_total: number;
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

const STATUS_TONE: Record<BillDetail["status"], string> = {
  draft: "bg-creamDk text-inkSoft",
  issued: "bg-yellowBg text-yellow",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BillDetailClient({
  bill,
  accounts,
  linkedOrders,
  ledgerEntries,
}: {
  bill: BillDetail;
  accounts: Array<{ code: string; name: string }>;
  linkedOrders: LinkedOrder[];
  ledgerEntries: LedgerLink[];
}) {
  const router = useRouter();
  const toast = useToast();

  const accountNameByCode: Record<string, string> = {};
  for (const a of accounts) accountNameByCode[a.code] = a.name;

  const balance = Math.max(0, bill.total - bill.paid_amount);

  const [showIssue, setShowIssue] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [issueErr, setIssueErr] = React.useState<string | null>(null);

  const [showPay, setShowPay] = React.useState(false);
  const [payAccount, setPayAccount] = React.useState<string>(accounts[0]?.code ?? "");
  const [payAmount, setPayAmount] = React.useState(String(balance));
  const [payDate, setPayDate] = React.useState(todayIso());
  const [paying, setPaying] = React.useState(false);
  const [payErr, setPayErr] = React.useState<string | null>(null);

  const [showCancel, setShowCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelErr, setCancelErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPayAmount(String(balance));
  }, [balance, showPay]);

  async function handleIssue() {
    if (issuing) return;
    setIssuing(true);
    setIssueErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("issue_bill", { p_bill_id: bill.id });
    setIssuing(false);
    if (error) {
      setIssueErr(error.message);
      return;
    }
    toast.push("Bill issued · linked receivables → billed", "success");
    setShowIssue(false);
    router.refresh();
  }

  async function handlePay() {
    if (paying) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayErr("Amount must be > 0.");
      return;
    }
    if (!payAccount) {
      setPayErr("Pick an account.");
      return;
    }
    setPaying(true);
    setPayErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_bill_paid", {
      p_bill_id: bill.id,
      p_account_code: payAccount,
      p_paid_amount: amt,
      p_paid_date: payDate,
    });
    setPaying(false);
    if (error) {
      setPayErr(error.message);
      return;
    }
    toast.push("Bill marked paid · ledger posted · orders updated", "success");
    setShowPay(false);
    router.refresh();
  }

  async function handleCancel() {
    if (cancelling) return;
    setCancelling(true);
    setCancelErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_bill", {
      p_bill_id: bill.id,
      p_reason: cancelReason.trim() || null,
    });
    setCancelling(false);
    if (error) {
      setCancelErr(error.message);
      return;
    }
    toast.push("Bill cancelled · linked receivables reopened", "success");
    setShowCancel(false);
    router.refresh();
  }

  function copyWixLink() {
    if (!bill.wix_invoice_url) return;
    navigator.clipboard?.writeText(bill.wix_invoice_url).then(
      () => toast.push("Wix invoice URL copied", "success"),
      () => toast.push("Couldn't copy — copy from the link manually", "error"),
    );
  }

  const canIssue = bill.status === "draft";
  const canPay = bill.status === "issued";
  const canCancel = bill.status === "draft" || bill.status === "issued";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">📑</span>
            {bill.external_id ?? "Bill"}
          </h1>
          <div className="flex items-center gap-2 text-sm text-inkSoft mt-1">
            <span>{bill.partner_name}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                STATUS_TONE[bill.status],
              )}
            >
              {bill.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canCancel ? (
            <Button variant="dangerGhost" onClick={() => setShowCancel(true)}>
              Cancel bill
            </Button>
          ) : null}
          {canIssue ? <Button onClick={() => setShowIssue(true)}>Issue bill</Button> : null}
          {canPay ? <Button onClick={() => setShowPay(true)}>Mark paid</Button> : null}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-border rounded-lg shadow-card p-5 space-y-3 text-sm">
          <Row label="Bill date" value={formatDate(bill.bill_date)} />
          <Row label="Due date" value={bill.due_date ? formatDate(bill.due_date) : "—"} />
          {bill.payment_terms ? <Row label="Payment terms" value={bill.payment_terms} /> : null}
          <Row label="Subtotal" value={<span className="font-mono">{formatPHP(bill.subtotal)}</span>} />
          {bill.delivery_fees > 0 ? (
            <Row label="Delivery fees" value={<span className="font-mono">{formatPHP(bill.delivery_fees)}</span>} />
          ) : null}
          {bill.discount > 0 ? (
            <Row label="Discount" value={<span className="font-mono">−{formatPHP(bill.discount)}</span>} />
          ) : null}
          <Row label="Total" value={<span className="font-mono font-bold text-berry text-lg">{formatPHP(bill.total)}</span>} />
          <Row label="Paid" value={<span className="font-mono">{formatPHP(bill.paid_amount)}</span>} />
          <Row label="Balance" value={<span className="font-mono text-coral">{formatPHP(balance)}</span>} />
          {bill.notes ? <Row label="Notes" value={bill.notes} /> : null}
          {bill.cancel_reason ? <Row label="Cancel reason" value={bill.cancel_reason} /> : null}
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-5 space-y-3 text-sm">
          <h2 className="font-serif font-bold text-lg text-ink">Wix invoice</h2>
          {bill.wix_invoice_url ? (
            <>
              <a
                href={bill.wix_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-berry hover:underline break-all"
              >
                {bill.wix_invoice_url}
              </a>
              <Button variant="ghost" size="sm" onClick={copyWixLink}>
                <Copy className="w-3.5 h-3.5" />
                Copy link
              </Button>
            </>
          ) : (
            <p className="text-xs text-inkSoft">
              Not yet pushed to Wix. The Wix invoice integration ships in Phase 3.
            </p>
          )}
        </div>
      </div>

      <section>
        <h2 className="font-serif font-bold text-lg text-ink mb-3">
          Linked orders ({linkedOrders.length})
        </h2>
        {linkedOrders.length === 0 ? (
          <p className="text-sm text-inkSoft">No receivables linked to this bill yet.</p>
        ) : (
          <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream text-inkSoft">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold w-32">Receivable</th>
                  <th className="px-4 py-2 font-semibold w-32">Order</th>
                  <th className="px-4 py-2 font-semibold w-28">Order date</th>
                  <th className="px-4 py-2 font-semibold w-28 text-right">Order total</th>
                  <th className="px-4 py-2 font-semibold w-28 text-right">Amount on bill</th>
                  <th className="px-4 py-2 font-semibold w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {linkedOrders.map((r) => (
                  <tr key={r.receivable_id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {r.receivable_external_id ?? r.receivable_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {r.order_id && r.order_external_id ? (
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
                    <td className="px-4 py-2.5 text-xs text-inkSoft">
                      {r.order_date ? formatDate(r.order_date) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatPHP(r.order_total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatPHP(r.receivable_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-xs capitalize">{r.receivable_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif font-bold text-lg text-ink mb-3">Payment history</h2>
        {ledgerEntries.length === 0 ? (
          <p className="text-sm text-inkSoft">No payments posted to this bill yet.</p>
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
                      <span aria-hidden className="mr-1">{accountEmoji(e.account_code)}</span>
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
        open={showIssue}
        onClose={issuing ? () => {} : () => setShowIssue(false)}
        title={`Issue ${bill.external_id ?? "bill"}?`}
        description="Locks the bill at its current total. Linked receivables flip from pending → billed."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowIssue(false)} disabled={issuing}>
              Cancel
            </Button>
            <Button onClick={handleIssue} disabled={issuing}>
              {issuing ? "Issuing…" : "Confirm issue"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-inkSoft">
          Total: <span className="font-mono">{formatPHP(bill.total)}</span> · Partner:{" "}
          <span className="font-semibold">{bill.partner_name}</span>
        </p>
        {issueErr ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2 mt-3">
            {issueErr}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={showPay}
        onClose={paying ? () => {} : () => setShowPay(false)}
        title="Mark bill paid"
        description={`Receives ${formatPHP(balance)} into the selected account.`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPay(false)} disabled={paying}>
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={paying}>
              {paying ? "Posting…" : "Confirm payment"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bp_account" required>
                Account
              </Label>
              <Select
                id="bp_account"
                value={payAccount}
                onChange={(e) => setPayAccount(e.target.value)}
                disabled={paying}
              >
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bp_amount" required>
                Amount
              </Label>
              <NumberInput
                id="bp_amount"
                prefix="₱"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                disabled={paying}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bp_date" required>
              Paid date
            </Label>
            <DateInput
              id="bp_date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              disabled={paying}
            />
          </div>
          {payErr ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
              {payErr}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={showCancel}
        onClose={cancelling ? () => {} : () => setShowCancel(false)}
        title={`Cancel ${bill.external_id ?? "bill"}?`}
        description="Linked receivables flip back to pending. Cannot be undone via the UI."
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
        <div className="space-y-1">
          <Label htmlFor="bc_reason">Reason</Label>
          <Textarea
            id="bc_reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            disabled={cancelling}
          />
          {cancelErr ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2 mt-2">
              {cancelErr}
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
