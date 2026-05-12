"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatPHP } from "@/lib/utils";
import { accountEmoji } from "../account-icons";
import type { ExpenseRow } from "./expenses-view";

export function ExpenseDetailModal({
  expense,
  accounts,
  canVoid,
  onClose,
  onVoided,
}: {
  expense: ExpenseRow | null;
  accounts: Array<{ code: string; name: string }>;
  canVoid: boolean;
  onClose: () => void;
  onVoided: () => void;
}) {
  const toast = useToast();
  const [confirmVoid, setConfirmVoid] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");
  const [voiding, setVoiding] = React.useState(false);

  React.useEffect(() => {
    if (expense) {
      setVoidReason("");
      setConfirmVoid(false);
    }
  }, [expense]);

  if (!expense) return null;

  const accountName =
    accounts.find((a) => a.code === expense.account_code)?.name ?? expense.account_code;
  const isVoided = !!expense.voided_at;

  async function handleVoid() {
    if (!expense || voiding) return;
    setVoiding(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("void_expense", {
      p_expense_id: expense.id,
      p_reason: voidReason.trim() || null,
    });
    setVoiding(false);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    toast.push("Expense voided · ledger reversed", "success");
    setConfirmVoid(false);
    onVoided();
  }

  return (
    <>
      <Modal
        open={expense !== null && !confirmVoid}
        onClose={onClose}
        title={expense.external_id ?? "Expense"}
        description={isVoided ? "This expense has been voided." : undefined}
        size="md"
        footer={
          canVoid && !isVoided ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button variant="dangerGhost" onClick={() => setConfirmVoid(true)}>
                Void expense
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        <dl className="text-sm space-y-2.5">
          <Row label="Date" value={formatDate(expense.expense_date)} />
          <Row label="Category" value={expense.category} />
          <Row label="Vendor" value={expense.vendor ?? "—"} />
          <Row label="Description" value={expense.description} />
          <Row
            label="Amount"
            value={<span className="font-mono text-coral">{formatPHP(expense.amount)}</span>}
          />
          <Row
            label="Account"
            value={
              <span>
                <span aria-hidden className="mr-1">{accountEmoji(expense.account_code)}</span>
                {accountName}
              </span>
            }
          />
          {expense.payment_ref ? <Row label="Payment ref" value={expense.payment_ref} /> : null}
          {expense.receipt_url ? (
            <Row
              label="Receipt"
              value={
                <a
                  href={expense.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-berry hover:underline truncate"
                >
                  {expense.receipt_url}
                </a>
              }
            />
          ) : null}
          {expense.notes ? <Row label="Notes" value={expense.notes} /> : null}
          {expense.logged_by_name ? (
            <Row label="Logged by" value={expense.logged_by_name} />
          ) : null}
          {isVoided ? (
            <>
              <Row label="Voided at" value={formatDate(expense.voided_at!)} />
              {expense.void_reason ? (
                <Row label="Void reason" value={expense.void_reason} />
              ) : null}
            </>
          ) : null}
        </dl>
      </Modal>

      <Modal
        open={confirmVoid}
        onClose={voiding ? () => {} : () => setConfirmVoid(false)}
        title={`Void ${expense.external_id ?? "expense"}?`}
        description="A reversing ledger entry will be posted. The expense stays in the list with a strikethrough for audit."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmVoid(false)}
              disabled={voiding}
            >
              Cancel
            </Button>
            <Button variant="dangerGhost" onClick={handleVoid} disabled={voiding}>
              {voiding ? "Voiding…" : "Void expense"}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Label htmlFor="void_reason">Reason (optional)</Label>
          <Textarea
            id="void_reason"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            rows={2}
            disabled={voiding}
          />
        </div>
      </Modal>
    </>
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
