"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

// Manual stock adjustment for resale goods — off-POS market days, spoilage, or
// physical-count corrections. Deducts/adds without a cash entry.
export function AdjustStockButton({ code, unit }: { code: string; unit: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [direction, setDirection] = React.useState<"out" | "in">("out");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const n = Number(qty);
  const canSubmit = !busy && Number.isFinite(n) && n > 0;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const delta = direction === "out" ? -n : n;
    const supabase = createClient();
    const { error } = await supabase.rpc("adjust_resale_stock", {
      p_code: code,
      p_delta: delta,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) { toast.push(error.message || "Couldn't adjust", "error"); return; }
    toast.push(`Stock ${direction === "out" ? "reduced" : "increased"} by ${n} ${unit}`, "success");
    setOpen(false); setQty(""); setReason(""); setDirection("out");
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust stock
      </Button>
      {open ? (
        <Modal
          open
          onClose={busy ? () => {} : () => setOpen(false)}
          title="Adjust stock"
          description="For off-POS market sales, spoilage, or a physical-count correction. No cash entry is made."
          size="sm"
          footer={<>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit}>{busy ? "Saving…" : "Apply"}</Button>
          </>}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Direction</Label>
              <Select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")} disabled={busy}>
                <option value="out">Remove from stock (sold / spoiled)</option>
                <option value="in">Add to stock (returned / correction)</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label required>Quantity ({unit})</Label>
              <NumberInput min="0" step="1" value={qty} onChange={(e) => setQty(e.target.value)} disabled={busy} className="text-right" autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} placeholder="e.g. Oct 6 market, off-POS" />
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
