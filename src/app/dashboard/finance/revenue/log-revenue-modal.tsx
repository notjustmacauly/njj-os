"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { formatPHP } from "@/lib/utils";

export type RevenueCategory =
  | "catering_contract"
  | "event"
  | "sponsorship"
  | "rent"
  | "other";

export const REVENUE_CATEGORY_LABELS: Record<RevenueCategory, string> = {
  catering_contract: "Catering / contracts",
  event: "Events",
  sponsorship: "Sponsorship",
  rent: "Rent",
  other: "Other",
};

const CATEGORY_ORDER: RevenueCategory[] = [
  "catering_contract",
  "event",
  "sponsorship",
  "rent",
  "other",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogRevenueModal({
  open,
  onClose,
  accounts,
  loggedByName,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Array<{ code: string; name: string }>;
  loggedByName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [accountCode, setAccountCode] = React.useState(accounts[0]?.code ?? "");
  const [date, setDate] = React.useState(todayIso());
  const [category, setCategory] =
    React.useState<RevenueCategory>("catering_contract");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAccountCode(accounts[0]?.code ?? "");
      setDate(todayIso());
      setCategory("catering_contract");
      setDescription("");
      setAmount("");
      setNotes("");
    }
  }, [open, accounts]);

  async function submit() {
    const amt = Number(amount);
    if (!accountCode) {
      toast.push("Pick a receiving account", "error");
      return;
    }
    if (!date) {
      toast.push("Pick a date", "error");
      return;
    }
    if (!description.trim()) {
      toast.push("Description is required", "error");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.push("Amount must be > 0", "error");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("log_revenue", {
      p_revenue_date: date,
      p_category: category,
      p_description: description.trim(),
      p_amount: amt,
      p_account_code: accountCode,
      p_notes: notes.trim() || null,
      p_logged_by_name: loggedByName || null,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't log revenue", "error");
      return;
    }
    const accountName =
      accounts.find((a) => a.code === accountCode)?.name ?? accountCode;
    toast.push(
      `Revenue logged — ${formatPHP(amt)} into ${accountName}.`,
      "success",
    );
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Log revenue"
      description="Standalone income — catering contracts, events, sponsorship, rent, misc."
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Logging…" : "Log revenue"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="rev_account" required>
            Receiving account
          </Label>
          <Select
            id="rev_account"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="rev_date" required>
              Date
            </Label>
            <DateInput
              id="rev_date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rev_category" required>
              Category
            </Label>
            <Select
              id="rev_category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as RevenueCategory)
              }
              disabled={busy}
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {REVENUE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="rev_desc" required>
            Description
          </Label>
          <Input
            id="rev_desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Globe office catering — May"
            disabled={busy}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rev_amount" required>
            Amount
          </Label>
          <NumberInput
            id="rev_amount"
            prefix="₱"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="rev_notes">Notes</Label>
          <Textarea
            id="rev_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — context, invoice ref, etc."
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  );
}
