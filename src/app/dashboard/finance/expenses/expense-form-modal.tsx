"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { Role } from "@/lib/roles";
import { FINANCE_CATEGORIES } from "../categories";

const THRESHOLD = 20000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormModal({
  open,
  onClose,
  role,
  accounts,
  defaultLoggedByName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  role: Role;
  accounts: Array<{ code: string; name: string }>;
  defaultLoggedByName: string;
  onSaved: () => void;
}) {
  const toast = useToast();

  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [expenseDate, setExpenseDate] = React.useState(todayIso());
  const [category, setCategory] = React.useState<string>(FINANCE_CATEGORIES[0]);
  const [vendor, setVendor] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountCode, setAccountCode] = React.useState<string>(accounts[0]?.code ?? "");
  const [receiptUrl, setReceiptUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [overrideThreshold, setOverrideThreshold] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setExpenseDate(todayIso());
      setCategory(FINANCE_CATEGORIES[0]);
      setVendor("");
      setDescription("");
      setAmount("");
      setAccountCode(accounts[0]?.code ?? "");
      setReceiptUrl("");
      setNotes("");
      setOverrideThreshold(false);
      setError(null);
    }
  }, [open, accounts]);

  const amt = Number(amount);
  const amountValid = Number.isFinite(amt) && amt > 0;
  const overThreshold = amountValid && amt >= THRESHOLD;
  const isManager = role === "manager";
  const isOwnerOrPartner = role === "owner" || role === "partner";

  // Submit gate per the access matrix:
  //  - Manager + ≥ ₱20K → blocked (must go through Payments approval).
  //  - Owner/Partner + ≥ ₱20K → unblocked only when the retroactive
  //    checkbox is ticked (passes p_override_threshold to the RPC).
  const blockedByThreshold = isManager && overThreshold;
  const needsOverride = isOwnerOrPartner && overThreshold;
  const canSubmit =
    !submitting &&
    amountValid &&
    !blockedByThreshold &&
    (!needsOverride || overrideThreshold);

  // Pre-fill the Payments form so a manager can submit ≥ ₱20K cleanly.
  const paymentLink = `/dashboard/finance/payments/new?purpose=${encodeURIComponent(
    description || vendor || "",
  )}&amount=${encodeURIComponent(amount || "")}`;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    if (!description.trim()) return setError("Description is required.");
    if (!accountCode) return setError("Pick an account.");

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("create_expense", {
      p_idempotency_key: idempotencyKey,
      p_amount: amt,
      p_category: category,
      p_description: description.trim(),
      p_account_code: accountCode,
      p_expense_date: expenseDate,
      p_vendor: vendor.trim() || null,
      p_payment_ref: null,
      p_receipt_url: receiptUrl.trim() || null,
      p_notes: notes.trim() || null,
      p_logged_by_name: defaultLoggedByName,
      p_override_threshold: needsOverride && overrideThreshold,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      toast.push(rpcErr.message, "error");
      return;
    }
    const fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
    toast.push(
      overrideThreshold
        ? `✓ ${fmt.format(amt)} retroactive expense logged. Threshold override used.`
        : `✓ Logged ${fmt.format(amt)} expense`,
      "success",
    );
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Log expense"
      description="Posts an outbound ledger entry from the selected account."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Logging…" : "Log expense"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="exp_date" required>
              Date
            </Label>
            <DateInput
              id="exp_date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp_category" required>
              Category
            </Label>
            <Select
              id="exp_category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
            >
              {FINANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="exp_vendor">Vendor</Label>
          <Input
            id="exp_vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="SM Hypermarket"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="exp_description" required>
            Description
          </Label>
          <Input
            id="exp_description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ice + cups for booth"
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="exp_amount" required>
              Amount
            </Label>
            <NumberInput
              id="exp_amount"
              prefix="₱"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp_account" required>
              Account
            </Label>
            <Select
              id="exp_account"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              disabled={submitting || accounts.length === 0}
            >
              {accounts.length === 0 ? (
                <option value="">No accessible accounts</option>
              ) : (
                accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))
              )}
            </Select>
          </div>
        </div>

        {blockedByThreshold ? (
          <p className="text-sm bg-yellowBg border border-yellow/40 text-yellow rounded-md px-3 py-2">
            Expenses ≥ ₱20,000 require approval —{" "}
            <Link href={paymentLink} className="font-semibold underline hover:no-underline">
              Submit as Payment request →
            </Link>
          </p>
        ) : null}

        {needsOverride ? (
          <label className="flex items-start gap-2 text-sm bg-cream/40 border border-border rounded-md px-3 py-2">
            <input
              type="checkbox"
              checked={overrideThreshold}
              onChange={(e) => setOverrideThreshold(e.target.checked)}
              disabled={submitting}
              className="mt-0.5"
            />
            <span>
              This was already paid — log retroactively (skips approval flow). Use only when
              the payment really happened and you&rsquo;re recording it after the fact.
            </span>
          </label>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="exp_receipt">Receipt URL</Label>
          <Input
            id="exp_receipt"
            type="url"
            value={receiptUrl}
            onChange={(e) => setReceiptUrl(e.target.value)}
            placeholder="optional — paste a link"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="exp_notes">Notes</Label>
          <Textarea
            id="exp_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
          />
        </div>

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
