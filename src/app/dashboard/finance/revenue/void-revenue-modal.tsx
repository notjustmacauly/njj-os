"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";

// Voids a standalone revenue entry (ref_type='revenue'); posts a counter-entry
// to the ledger so balances stay correct. Row stays for audit.
export type VoidTarget = { id: string; description: string; amount: number; account_code: string };

export function VoidRevenueModal({ target, onClose }: { target: VoidTarget | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (target) setReason("");
  }, [target]);

  async function submit() {
    if (!target) return;
    if (!reason.trim()) {
      toast.push("Reason is required", "error");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("void_revenue_entry", {
      p_id: target.id,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't void entry", "error");
      return;
    }
    toast.push("Revenue entry voided — counter-entry posted to ledger.", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={target != null}
      onClose={() => { if (!busy) onClose(); }}
      title="Void revenue entry"
      description={target ? `${target.description} · ${formatPHP(target.amount)}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="dangerGhost" size="sm" onClick={submit} disabled={busy}>
            {busy ? "Voiding…" : "Void entry"}
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <Label htmlFor="void_reason" required>Reason</Label>
        <Textarea
          id="void_reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being voided?"
          disabled={busy}
        />
        <p className="text-xs text-inkSoft">
          Posts a counter-entry to {target?.account_code ?? "the same account"} so the ledger balances.
          Row stays in the list for audit.
        </p>
      </div>
    </Modal>
  );
}
