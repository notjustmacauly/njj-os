"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatPHP } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { FINANCE_CATEGORIES } from "../../categories";

type PaymentType = "general" | "transfer";

export function NewPaymentForm({
  role,
  accounts,
  requestedByName,
}: {
  role: Role;
  accounts: Array<{ code: string; name: string }>;
  requestedByName: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // Only owner can transfer (and only owner reaches this page anyway).
  const canTransfer = role === "owner";

  const [type, setType] = React.useState<PaymentType>("general");
  const [purpose, setPurpose] = React.useState("");
  const [payee, setPayee] = React.useState("");
  const [category, setCategory] = React.useState<string>(FINANCE_CATEGORIES[0]);
  const [amount, setAmount] = React.useState("");
  const [accountCode, setAccountCode] = React.useState(accounts[0]?.code ?? "");
  const [transferTo, setTransferTo] = React.useState<string>(
    accounts[1]?.code ?? accounts[0]?.code ?? "",
  );
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const idempotencyKey = React.useMemo(() => crypto.randomUUID(), []);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setError(null);

    if (!purpose.trim()) return setError("Purpose is required.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Amount must be > 0.");
    if (!accountCode) return setError("Pick a source account.");

    if (type === "transfer") {
      if (!canTransfer) return setError("Only the owner can request transfers.");
      if (!transferTo) return setError("Pick a destination account.");
      if (transferTo === accountCode)
        return setError("Source and destination must differ.");
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("create_payment_request", {
      p_idempotency_key: idempotencyKey,
      p_purpose: purpose.trim(),
      p_amount: amt,
      p_account_code: accountCode,
      p_type: type,
      p_payee: type === "transfer" ? null : payee.trim() || null,
      p_category: type === "transfer" ? null : category,
      p_transfer_to_account_code: type === "transfer" ? transferTo : null,
      p_notes: notes.trim() || null,
      p_requested_by_name: requestedByName,
    });
    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      toast.push(rpcErr.message, "error");
      return;
    }

    toast.push("Payment request submitted", "success");
    router.push("/dashboard/finance/payments?tab=pending");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl bg-white border border-border rounded-lg shadow-card p-6 space-y-5"
    >
      <div className="space-y-1">
        <Label required>Type</Label>
        <div className="flex gap-2">
          {(["general", "transfer"] as PaymentType[]).map((t) => {
            const disabled = t === "transfer" && !canTransfer;
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => !disabled && setType(t)}
                disabled={disabled}
                className={cn(
                  "px-4 py-2 rounded-md border text-sm font-semibold transition capitalize",
                  active
                    ? "bg-berry text-white border-berry"
                    : "bg-white text-ink border-border hover:bg-cream",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
                title={disabled ? "Transfers require the owner" : undefined}
              >
                {t === "general" ? "Payment" : "Transfer"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="pay_purpose" required>
          Purpose
        </Label>
        <Input
          id="pay_purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder={
            type === "transfer" ? "Move ₱20k to RCBC Main" : "Pay produce supplier"
          }
          disabled={submitting}
        />
      </div>

      {type !== "transfer" ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="pay_payee">Payee</Label>
            <Input
              id="pay_payee"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="Mama Sita Vegetables"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay_category">Category</Label>
            <Select
              id="pay_category"
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
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="pay_amount" required>
            Amount
          </Label>
          <NumberInput
            id="pay_amount"
            prefix="₱"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pay_from" required>
            From account
          </Label>
          <Select
            id="pay_from"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            disabled={submitting}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {type === "transfer" ? (
        <div className="space-y-1">
          <Label htmlFor="pay_to" required>
            To account
          </Label>
          <Select
            id="pay_to"
            value={transferTo}
            onChange={(e) => setTransferTo(e.target.value)}
            disabled={submitting}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code} disabled={a.code === accountCode}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="pay_notes">Notes</Label>
        <Textarea
          id="pay_notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          rows={2}
        />
      </div>

      {amount && Number(amount) > 0 ? (
        <p className="text-xs text-inkSoft bg-cream/40 border border-border rounded-md px-3 py-2">
          Will request {formatPHP(amount)} out of{" "}
          <span className="font-semibold">
            {accounts.find((a) => a.code === accountCode)?.name ?? accountCode}
          </span>
          {type === "transfer" ? (
            <>
              {" → "}
              <span className="font-semibold">
                {accounts.find((a) => a.code === transferTo)?.name ?? transferTo}
              </span>
            </>
          ) : null}
          . Status starts <span className="font-mono">pending</span>.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
