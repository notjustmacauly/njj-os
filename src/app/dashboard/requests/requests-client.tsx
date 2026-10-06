"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wallet, Receipt, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { FINANCE_CATEGORIES } from "../finance/categories";

export type MyRequest = {
  id: string;
  type: "general" | "reimbursement" | "transfer";
  purpose: string;
  payee: string | null;
  amount: number | string;
  status: "pending" | "approved" | "paid" | "cancelled";
  created_at: string;
  paid_date: string | null;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

const STATUS: Record<MyRequest["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-yellowBg text-yellow" },
  approved: { label: "Approved", cls: "bg-periBg text-peri" },
  paid: { label: "Paid", cls: "bg-greenBg text-green" },
  cancelled: { label: "Declined", cls: "bg-salmonBg text-coral" },
};

export function RequestsClient({ myName, requests }: { myName: string; requests: MyRequest[] }) {
  const [mode, setMode] = React.useState<null | "general" | "reimbursement">(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-ink">Requests</h1>
        <p className="text-sm text-inkSoft mt-1">
          Submit a payment or a reimbursement for approval. You&rsquo;ll get a notification once it&rsquo;s paid.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("general")}
          className="text-left bg-white border border-border rounded-lg shadow-card p-5 hover:border-berry/50 hover:shadow-md transition"
        >
          <div className="flex items-center gap-2 text-berry"><Wallet className="w-5 h-5" /><span className="font-semibold text-ink">Request a payment</span></div>
          <p className="text-sm text-inkSoft mt-1">Ask for a supplier/vendor payment to be made.</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-berry"><Plus className="w-3.5 h-3.5" /> New payment request</span>
        </button>
        <button
          type="button"
          onClick={() => setMode("reimbursement")}
          className="text-left bg-white border border-border rounded-lg shadow-card p-5 hover:border-berry/50 hover:shadow-md transition"
        >
          <div className="flex items-center gap-2 text-berry"><Receipt className="w-5 h-5" /><span className="font-semibold text-ink">Request a reimbursement</span></div>
          <p className="text-sm text-inkSoft mt-1">Get paid back for something you spent on.</p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-berry"><Plus className="w-3.5 h-3.5" /> New reimbursement</span>
        </button>
      </div>

      <div>
        <h2 className="font-serif font-bold text-xl text-ink mb-2">My requests</h2>
        <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Type</th>
                <th className="text-left font-semibold px-4 py-2">For</th>
                <th className="text-right font-semibold px-4 py-2">Amount</th>
                <th className="text-left font-semibold px-4 py-2">Status</th>
                <th className="text-left font-semibold px-4 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-inkSoft">No requests yet. Submit one above.</td></tr>
              ) : requests.map((r) => {
                const s = STATUS[r.status] ?? STATUS.pending;
                return (
                  <tr key={r.id} className="hover:bg-cream/40">
                    <td className="px-4 py-2.5 text-ink">{r.type === "reimbursement" ? "Reimbursement" : "Payment"}</td>
                    <td className="px-4 py-2.5 text-ink">{r.purpose}{r.payee && r.type !== "reimbursement" ? <span className="text-inkSoft"> · {r.payee}</span> : null}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">{peso.format(Number(r.amount))}</td>
                    <td className="px-4 py-2.5"><span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>{s.label}</span></td>
                    <td className="px-4 py-2.5 text-inkSoft">{fmtDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {mode ? <RequestModal mode={mode} myName={myName} onClose={() => setMode(null)} /> : null}
    </div>
  );
}

function RequestModal({ mode, myName, onClose }: { mode: "general" | "reimbursement"; myName: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const isReimb = mode === "reimbursement";
  const [purpose, setPurpose] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [payee, setPayee] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const amt = Number(amount);
  const canSubmit = !busy && purpose.trim().length > 0 && Number.isFinite(amt) && amt > 0 && (isReimb || payee.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_payment_request", {
      p_idempotency_key: crypto.randomUUID(),
      p_purpose: purpose.trim(),
      p_amount: amt,
      p_account_code: null,
      p_type: mode,
      p_payee: isReimb ? myName : payee.trim(),
      p_category: isReimb ? null : (category || null),
      p_transfer_to_account_code: null,
      p_notes: notes.trim() || null,
      p_requested_by_name: myName,
    });
    setBusy(false);
    if (error) { toast.push(error.message || "Couldn't submit", "error"); return; }
    toast.push(`${isReimb ? "Reimbursement" : "Payment"} submitted — you'll be notified when it's paid`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={isReimb ? "Request a reimbursement" : "Request a payment"}
      description={isReimb ? "For something you paid for out of pocket." : "For a supplier or vendor payment."}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={!canSubmit}>{busy ? "Submitting…" : "Submit request"}</Button>
      </>}
    >
      <div className="space-y-4">
        {!isReimb ? (
          <div className="space-y-1">
            <Label htmlFor="payee" required>Pay to (supplier / vendor)</Label>
            <Input id="payee" value={payee} onChange={(e) => setPayee(e.target.value)} disabled={busy} placeholder="e.g. ABC Printing" />
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="purpose" required>{isReimb ? "What you paid for" : "What it's for"}</Label>
          <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={busy} placeholder={isReimb ? "e.g. Tarpaulin for booth" : "e.g. Monthly ad boost"} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="amount" required>Amount</Label>
          <NumberInput id="amount" prefix="₱" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} className="text-right" autoFocus />
        </div>

        {!isReimb ? (
          <div className="space-y-1">
            <Label htmlFor="category">Category</Label>
            <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy}>
              <option value="">— choose —</option>
              {FINANCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder="Anything that helps approve it (optional)" />
        </div>

        <p className="text-xs text-inkSoft">
          Goes to the owner for approval. You&rsquo;ll get a notification when it&rsquo;s paid{isReimb ? "" : " or declined"}.
        </p>
      </div>
    </Modal>
  );
}
