"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatPHP } from "@/lib/utils";
import { FINANCE_CATEGORIES } from "../categories";
import { accountEmoji } from "../account-icons";
import type { ExpenseRow } from "./expenses-view";

export function ExpenseDetailModal({
  expense,
  accounts,
  canVoid,
  canEdit = false,
  hideAmounts = false,
  onClose,
  onVoided,
}: {
  expense: ExpenseRow | null;
  accounts: Array<{ code: string; name: string }>;
  canVoid: boolean;
  canEdit?: boolean;
  hideAmounts?: boolean;
  onClose: () => void;
  onVoided: () => void;
}) {
  const toast = useToast();
  const [confirmVoid, setConfirmVoid] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");
  const [voiding, setVoiding] = React.useState(false);

  // Owner-only edit mode (fix wrong category etc.)
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (expense) {
      setVoidReason("");
      setConfirmVoid(false);
      setEditing(false);
      setEditError(null);
      setCategory(expense.category ?? "");
      setDescription(expense.description ?? "");
      setVendor(expense.vendor ?? "");
      setExpenseDate(expense.expense_date ?? "");
      setNotes(expense.notes ?? "");
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

  async function handleSaveEdit() {
    if (!expense || saving) return;
    setEditError(null);
    if (!category) return setEditError("Choose a category.");
    if (!description.trim()) return setEditError("Description is required.");
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("edit_expense", {
      p_expense_id: expense.id,
      p_category: category,
      p_description: description.trim(),
      p_vendor: vendor.trim() || null,
      p_expense_date: expenseDate || null,
      p_notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    toast.push("Expense updated", "success");
    setEditing(false);
    onVoided(); // reuse: refresh + close from parent
  }

  return (
    <>
      <Modal
        open={expense !== null && !confirmVoid}
        onClose={saving ? () => {} : onClose}
        title={expense.external_id ?? "Expense"}
        description={
          editing
            ? "Correcting category / details. Amount and account can't change here — void & re-create for those."
            : isVoided
              ? "This expense has been voided."
              : undefined
        }
        size="md"
        footer={
          editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              {canEdit && !isVoided ? (
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
              {canVoid && !isVoided ? (
                <Button variant="dangerGhost" onClick={() => setConfirmVoid(true)}>
                  Void expense
                </Button>
              ) : null}
            </>
          )
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ed_date" required>Date</Label>
                <DateInput id="ed_date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} disabled={saving} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ed_category" required>Category</Label>
                <Select id="ed_category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
                  <option value="" disabled>— Choose a category —</option>
                  {FINANCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed_desc" required>Description</Label>
              <Input id="ed_desc" value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed_vendor">Vendor</Label>
              <Input id="ed_vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ed_notes">Notes</Label>
              <Textarea id="ed_notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={saving} />
            </div>
            <div className="rounded-lg border border-border bg-cream/40 px-3 py-2 text-xs text-inkSoft">
              Amount {hideAmounts ? "" : `(${formatPHP(expense.amount)}) `}and account (
              {accountName}) aren&rsquo;t editable here — void &amp; re-create to change those.
            </div>
            {editError ? (
              <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
                {editError}
              </p>
            ) : null}
          </div>
        ) : (
          <dl className="text-sm space-y-2.5">
            <Row label="Date" value={formatDate(expense.expense_date)} />
            <Row label="Category" value={expense.category} />
            <Row label="Vendor" value={expense.vendor ?? "—"} />
            <Row label="Description" value={expense.description} />
            <Row
              label="Amount"
              value={
                hideAmounts ? (
                  <span className="text-inkSoft" title="Hidden for your access level">
                    ••• <span className="text-[10px] uppercase tracking-smallcaps">hidden</span>
                  </span>
                ) : (
                  <span className="font-mono text-coral">{formatPHP(expense.amount)}</span>
                )
              }
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
        )}
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
