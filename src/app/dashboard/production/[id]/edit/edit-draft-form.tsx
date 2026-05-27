"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import type { IngredientRef } from "@/components/ui/ingredient-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TriStateRadio } from "@/components/ui/tri-state-radio";
import { useToast } from "@/components/ui/toast";
import {
  BatchInputsEditor,
  type BatchInputDraft,
  type LotOption,
} from "../../batch-inputs-editor";

type LotInput = {
  id: string;
  external_id: string | null;
  ingredient_code: string;
  qty_remaining: number | string;
  cost_per_unit: number | string;
  received_date: string;
};

type Initial = {
  batch_date: string;
  sku_code: string;
  units_planned: number;
  staff_name: string;
  notes: string;
  inputs: Array<{
    ingredient_code: string;
    qty_used: number;
    unit: string;
    lot_id: string | null;
  }>;
};

export function EditDraftForm({
  batchId,
  externalId,
  initial,
  skus,
  ingredients,
  lots,
  canFinalize,
  finalizeOpenInitial,
}: {
  batchId: string;
  externalId: string | null;
  initial: Initial;
  skus: Array<{
    code: string;
    name: string;
    short_label: string;
    can_ingredient_code: string | null;
  }>;
  ingredients: IngredientRef[];
  lots: LotInput[];
  canFinalize: boolean;
  finalizeOpenInitial: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const lotOptions: LotOption[] = React.useMemo(
    () =>
      lots.map((l) => ({
        id: l.id,
        external_id: l.external_id,
        ingredient_code: l.ingredient_code,
        qty_remaining: Number(l.qty_remaining ?? 0),
        cost_per_unit: Number(l.cost_per_unit ?? 0),
        received_date: l.received_date,
      })),
    [lots],
  );

  const [batchDate, setBatchDate] = React.useState(initial.batch_date);
  const [skuCode, setSkuCode] = React.useState(initial.sku_code);
  const [unitsPlanned, setUnitsPlanned] = React.useState(
    String(initial.units_planned),
  );
  const [staffName, setStaffName] = React.useState(initial.staff_name);
  const [notes, setNotes] = React.useState(initial.notes);
  const [inputs, setInputs] = React.useState<BatchInputDraft[]>(() =>
    initial.inputs.map((it) => ({
      tempId: crypto.randomUUID(),
      ingredient_code: it.ingredient_code,
      qty_used: it.qty_used,
      unit: it.unit,
      lot_id: it.lot_id,
    })),
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [finalizeOpen, setFinalizeOpen] = React.useState(finalizeOpenInitial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const plannedNum = Number(unitsPlanned) || 0;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!batchDate) e.batch_date = "Required";
    if (!skuCode) e.sku_code = "Required";
    if (!Number.isFinite(plannedNum) || plannedNum < 0) e.units_planned = "Must be ≥ 0";
    for (const it of inputs) {
      if (!it.ingredient_code) {
        e.inputs = "Pick an ingredient for every line";
        break;
      }
      if (!it.qty_used || it.qty_used <= 0) {
        e.inputs = "Each ingredient needs a qty > 0";
        break;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function saveDraft() {
    if (submitting) return;
    if (!validate()) {
      toast.push("Please fix the highlighted fields", "error");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_draft_batch", {
      p_batch_id: batchId,
      p_sku_code: skuCode,
      p_batch_date: batchDate,
      p_units_planned: plannedNum,
      p_staff_name: staffName.trim() || null,
      p_notes: notes.trim() || null,
      p_inputs: inputs.map((it) => ({
        ingredient_code: it.ingredient_code,
        qty_used: it.qty_used,
        unit: it.unit,
        lot_id: it.lot_id ?? "",
      })),
    });
    setSubmitting(false);
    if (error) {
      toast.push(error.message || "Couldn't save draft", "error");
      return;
    }
    toast.push("Draft saved", "success");
    router.refresh();
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    void saveDraft();
  }

  async function openFinalize() {
    // Persist any pending edits first so finalize sees the latest draft state.
    if (!validate()) {
      toast.push("Please fix the highlighted fields", "error");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_draft_batch", {
      p_batch_id: batchId,
      p_sku_code: skuCode,
      p_batch_date: batchDate,
      p_units_planned: plannedNum,
      p_staff_name: staffName.trim() || null,
      p_notes: notes.trim() || null,
      p_inputs: inputs.map((it) => ({
        ingredient_code: it.ingredient_code,
        qty_used: it.qty_used,
        unit: it.unit,
        lot_id: it.lot_id ?? "",
      })),
    });
    setSubmitting(false);
    if (error) {
      toast.push(error.message || "Couldn't save draft before finalize", "error");
      return;
    }
    setFinalizeOpen(true);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
          <h2 className="font-serif font-bold text-xl text-ink">Plan</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="batch_date" required>
                Batch date
              </Label>
              <DateInput
                id="batch_date"
                value={batchDate}
                onChange={(e) => setBatchDate(e.target.value)}
                disabled={submitting}
              />
              {errors.batch_date ? (
                <p className="text-xs text-coral mt-1">{errors.batch_date}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="sku_code" required>
                SKU
              </Label>
              <Select
                id="sku_code"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                disabled={submitting}
              >
                {skus.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.short_label} — {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="units_planned" required>
                Units planned
              </Label>
              <NumberInput
                id="units_planned"
                min="0"
                step="1"
                value={unitsPlanned}
                onChange={(e) => setUnitsPlanned(e.target.value)}
                disabled={submitting}
              />
              {errors.units_planned ? (
                <p className="text-xs text-coral mt-1">{errors.units_planned}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="staff_name">Staff</Label>
              <Input
                id="staff_name"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Who will run the batch?"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif font-bold text-xl text-ink">Ingredients</h2>
            {errors.inputs ? (
              <span className="text-xs text-coral">{errors.inputs}</span>
            ) : null}
          </div>
          <BatchInputsEditor
            inputs={inputs}
            onChange={setInputs}
            ingredients={ingredients}
            lots={lotOptions}
            skuFilter={skuCode}
            unitsProduced={0}
            disabled={submitting}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="berryGhost" disabled={submitting}>
            {submitting ? "Saving…" : "Save draft"}
          </Button>
          {canFinalize ? (
            <Button type="button" onClick={openFinalize} disabled={submitting}>
              Finalize…
            </Button>
          ) : null}
        </div>
        {!canFinalize ? (
          <p className="text-xs text-inkSoft text-right -mt-2">
            Only owner or partner can finalize. Save here and ask them to finalize.
          </p>
        ) : null}
      </form>

      <FinalizeDraftModal
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        batchId={batchId}
        externalId={externalId}
        defaultUnitsProduced={plannedNum}
      />
    </>
  );
}

function FinalizeDraftModal({
  open,
  onClose,
  batchId,
  externalId,
  defaultUnitsProduced,
}: {
  open: boolean;
  onClose: () => void;
  batchId: string;
  externalId: string | null;
  defaultUnitsProduced: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [unitsProduced, setUnitsProduced] = React.useState(
    String(defaultUnitsProduced),
  );
  const [wastage, setWastage] = React.useState("0");
  const [ph, setPh] = React.useState("");
  const [brix, setBrix] = React.useState("");
  const [qcPassed, setQcPassed] = React.useState<boolean | null>(null);
  const [qcNotes, setQcNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setUnitsProduced(String(defaultUnitsProduced));
      setWastage("0");
      setPh("");
      setBrix("");
      setQcPassed(null);
      setQcNotes("");
    }
  }, [open, defaultUnitsProduced]);

  async function handleFinalize() {
    const producedNum = Number(unitsProduced);
    const wastageNum = Number(wastage) || 0;
    if (!Number.isFinite(producedNum) || producedNum < 0) {
      toast.push("Units produced must be ≥ 0", "error");
      return;
    }
    if (ph) {
      const n = Number(ph);
      if (!Number.isFinite(n) || n < 0 || n > 14) {
        toast.push("pH must be between 0 and 14", "error");
        return;
      }
    }
    if (brix) {
      const n = Number(brix);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.push("Brix must be between 0 and 100", "error");
        return;
      }
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("finalize_batch", {
      p_batch_id: batchId,
      p_units_produced: producedNum,
      p_wastage: wastageNum,
      p_ph: ph ? Number(ph) : null,
      p_brix: brix ? Number(brix) : null,
      p_qc_passed: qcPassed,
      p_qc_notes: qcPassed === false ? qcNotes.trim() || null : null,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't finalize batch", "error");
      return;
    }
    toast.push(`Batch ${externalId ?? ""} finalized`, "success");
    onClose();
    router.push(`/dashboard/production/${batchId}`);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Finalize draft"
      description="Lots will be deducted and COGS posted to the ledger. This can't be undone."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleFinalize} disabled={busy}>
            {busy ? "Finalizing…" : "Finalize"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="finalize_units_produced" required>
              Units produced
            </Label>
            <NumberInput
              id="finalize_units_produced"
              min="0"
              step="1"
              value={unitsProduced}
              onChange={(e) => setUnitsProduced(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finalize_wastage">Wastage</Label>
            <NumberInput
              id="finalize_wastage"
              min="0"
              step="1"
              value={wastage}
              onChange={(e) => setWastage(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finalize_ph">pH</Label>
            <NumberInput
              id="finalize_ph"
              min="0"
              max="14"
              step="0.01"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              placeholder="3.50"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="finalize_brix">Brix</Label>
            <NumberInput
              id="finalize_brix"
              min="0"
              max="100"
              step="0.1"
              value={brix}
              onChange={(e) => setBrix(e.target.value)}
              placeholder="12.5"
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label required>QC</Label>
          <TriStateRadio
            value={qcPassed}
            onChange={setQcPassed}
            trueLabel="Passed"
            falseLabel="Failed"
            nullLabel="Not yet checked"
            disabled={busy}
          />
        </div>

        {qcPassed === false ? (
          <div className="space-y-1">
            <Label htmlFor="finalize_qc_notes">QC notes</Label>
            <Textarea
              id="finalize_qc_notes"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              placeholder="What went wrong?"
              disabled={busy}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
