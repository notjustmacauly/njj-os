"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";
import { FINANCE_CATEGORIES } from "../../categories";

// v1: hardcoded list. Phase 3 will link to a real team-members table.
const TEAM_PRESETS = ["Mac", "Hanneh", "Chrissia"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewReimbursementForm({
  accounts,
  requestedByName,
}: {
  accounts: Array<{ code: string; name: string }>;
  requestedByName: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [personChoice, setPersonChoice] = React.useState<string>(TEAM_PRESETS[0]);
  const [otherName, setOtherName] = React.useState("");
  const [originalDate, setOriginalDate] = React.useState(todayIso());
  const [category, setCategory] = React.useState<string>(FINANCE_CATEGORIES[0]);
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [accountCode, setAccountCode] = React.useState(accounts[0]?.code ?? "");
  const [receiptUrl, setReceiptUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const idempotencyKey = React.useMemo(() => crypto.randomUUID(), []);

  const finalPayee = personChoice === "Other" ? otherName.trim() : personChoice;

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setError(null);

    if (!finalPayee) return setError("Pick or enter a person to reimburse.");
    if (!description.trim()) return setError("Description is required.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Amount must be > 0.");
    if (!accountCode) return setError("Pick an account.");

    const notesBlock = [
      `Original purchase date: ${originalDate}`,
      receiptUrl.trim() ? `Receipt: ${receiptUrl.trim()}` : null,
      notes.trim() || null,
    ]
      .filter(Boolean)
      .join("\n");

    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc("create_payment_request", {
      p_idempotency_key: idempotencyKey,
      p_purpose: description.trim(),
      p_amount: amt,
      p_account_code: accountCode,
      p_type: "reimbursement",
      p_payee: finalPayee,
      p_category: category,
      p_transfer_to_account_code: null,
      p_notes: notesBlock || null,
      p_requested_by_name: requestedByName,
    });
    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      toast.push(rpcErr.message, "error");
      return;
    }

    toast.push("Reimbursement request submitted", "success");
    router.push("/dashboard/finance/reimbursements");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl bg-white border border-border rounded-lg shadow-card p-6 space-y-5"
    >
      <div className="space-y-1">
        <Label htmlFor="rb_person" required>
          Reimburse to
        </Label>
        <Select
          id="rb_person"
          value={personChoice}
          onChange={(e) => setPersonChoice(e.target.value)}
          disabled={submitting}
        >
          {TEAM_PRESETS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="Other">Other…</option>
        </Select>
        {personChoice === "Other" ? (
          <Input
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            placeholder="Name of person"
            disabled={submitting}
            className="mt-2"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="rb_date">Date paid (out of pocket)</Label>
          <DateInput
            id="rb_date"
            value={originalDate}
            onChange={(e) => setOriginalDate(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rb_category" required>
            Category
          </Label>
          <Select
            id="rb_category"
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
        <Label htmlFor="rb_description" required>
          Description
        </Label>
        <Input
          id="rb_description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Bought ice + cups at SM"
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="rb_amount" required>
            Amount
          </Label>
          <NumberInput
            id="rb_amount"
            prefix="₱"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rb_account" required>
            Paid from account
          </Label>
          <Select
            id="rb_account"
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

      <div className="space-y-1">
        <Label htmlFor="rb_receipt">Receipt URL</Label>
        <Input
          id="rb_receipt"
          type="url"
          value={receiptUrl}
          onChange={(e) => setReceiptUrl(e.target.value)}
          placeholder="optional — paste a link"
          disabled={submitting}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="rb_notes">Notes</Label>
        <Textarea
          id="rb_notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          rows={2}
        />
      </div>

      {amount && Number(amount) > 0 && finalPayee ? (
        <p className="text-xs text-inkSoft bg-cream/40 border border-border rounded-md px-3 py-2">
          Will request {formatPHP(amount)} for{" "}
          <span className="font-semibold">{finalPayee}</span> from{" "}
          <span className="font-semibold">
            {accounts.find((a) => a.code === accountCode)?.name ?? accountCode}
          </span>
          . When paid, an expense row will be created automatically in the {category} category.
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
