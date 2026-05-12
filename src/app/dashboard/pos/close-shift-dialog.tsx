"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatPHP } from "@/lib/utils";

export function CloseShiftDialog({
  open,
  onClose,
  shiftId,
  expectedCash,
  forceClose = false,
}: {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  expectedCash: number;
  /** When true, calls force_close_pos_shift (admin only) instead of close_pos_shift. */
  forceClose?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [closingCash, setClosingCash] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setClosingCash("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  const cashNum = Number(closingCash);
  const cashValid = closingCash !== "" && Number.isFinite(cashNum) && cashNum >= 0;
  const variance = cashValid ? cashNum - expectedCash : 0;

  async function handleSubmit() {
    if (submitting) return;
    if (!cashValid) {
      setError("Enter the counted closing cash.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const rpcName = forceClose ? "force_close_pos_shift" : "close_pos_shift";
    const args = forceClose
      ? {
          p_shift_id: shiftId,
          p_closing_cash: cashNum,
          p_reason: notes.trim() || "force-closed by admin",
        }
      : {
          p_shift_id: shiftId,
          p_closing_cash: cashNum,
          p_notes: notes.trim() || null,
        };
    const { error: rpcErr } = await supabase.rpc(rpcName, args);
    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      toast.push(rpcErr.message, "error");
      return;
    }

    toast.push("Shift closed", "success");
    onClose();
    router.push(`/dashboard/pos/sessions/${shiftId}`);
    router.refresh();
  }

  const varianceLabel =
    variance === 0 ? "even" : variance > 0 ? "over" : "short";
  const varianceTone =
    variance === 0
      ? "text-inkSoft"
      : variance > 0
        ? "text-emerald-700"
        : "text-coral";

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={forceClose ? "Force close shift" : "Close shift"}
      description={
        forceClose
          ? "Admin override — closes another user's shift with the cash count you enter."
          : "Once closed, this shift is finalized."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !cashValid}
            variant={forceClose ? "dangerGhost" : "primary"}
          >
            {submitting ? "Closing…" : "Close shift →"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-inkSoft">Expected cash (opening + cash sales)</dt>
            <dd className="font-mono font-semibold">{formatPHP(expectedCash)}</dd>
          </div>
        </dl>

        <div className="space-y-1">
          <Label htmlFor="closing_cash" required>
            Actual cash counted
          </Label>
          <NumberInput
            id="closing_cash"
            prefix="₱"
            min="0"
            step="1"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </div>

        {cashValid ? (
          <div className="bg-cream/60 border border-border rounded-md px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-inkSoft">Variance</span>
            <span className={cn("font-mono font-semibold", varianceTone)}>
              {variance > 0 ? "+" : variance < 0 ? "−" : ""}
              {formatPHP(Math.abs(variance))} ({varianceLabel})
            </span>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="close_notes">
            {forceClose ? "Reason / notes" : "Notes (optional)"}
          </Label>
          <Textarea
            id="close_notes"
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
