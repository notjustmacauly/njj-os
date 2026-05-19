"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import type { IngredientRef } from "@/components/ui/ingredient-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TriStateRadio } from "@/components/ui/tri-state-radio";
import { useToast } from "@/components/ui/toast";
import {
  BatchInputsEditor,
  type BatchInputDraft,
  type LotOption,
} from "../batch-inputs-editor";

type LotInput = {
  id: string;
  external_id: string | null;
  ingredient_code: string;
  qty_remaining: number | string;
  cost_per_unit: number | string;
  received_date: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewBatchForm({
  skus,
  ingredients,
  lots,
  defaultStaffName,
}: {
  skus: Array<{
    code: string;
    name: string;
    short_label: string;
    can_ingredient_code: string | null;
  }>;
  ingredients: IngredientRef[];
  lots: LotInput[];
  defaultStaffName: string;
}) {
  // Normalize lot numeric fields once for the editor.
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
  const router = useRouter();
  const toast = useToast();

  const idempotencyKey = React.useMemo(() => crypto.randomUUID(), []);

  const [batchDate, setBatchDate] = React.useState(todayIso());
  const [skuCode, setSkuCode] = React.useState(skus[0]?.code ?? "PCL");
  const [unitsPlanned, setUnitsPlanned] = React.useState("100");
  const [unitsProduced, setUnitsProduced] = React.useState("100");
  const [wastage, setWastage] = React.useState("0");
  const [ph, setPh] = React.useState("");
  const [brix, setBrix] = React.useState("");
  const [qcPassed, setQcPassed] = React.useState<boolean | null>(null);
  const [qcNotes, setQcNotes] = React.useState("");
  const [staffName, setStaffName] = React.useState(defaultStaffName);
  const [notes, setNotes] = React.useState("");
  const [inputs, setInputs] = React.useState<BatchInputDraft[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const plannedNum = Number(unitsPlanned) || 0;
  const producedNum = Number(unitsProduced) || 0;
  const wastageNum = Number(wastage) || 0;
  const yieldOverPlanned = producedNum > plannedNum && plannedNum > 0;
  const wastageHigh = plannedNum > 0 && wastageNum > plannedNum * 0.1;

  // Auto-can deduction: the create_batch RPC pulls cans matching the SKU's
  // linked can ingredient from FIFO inventory based on units_produced —
  // surface the upcoming deduction so it isn't surprising.
  const currentSku = skus.find((s) => s.code === skuCode);
  const canCode = currentSku?.can_ingredient_code ?? null;
  const canIngredient = canCode
    ? ingredients.find((i) => i.code === canCode) ?? null
    : null;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!batchDate) e.batch_date = "Required";
    if (!skuCode) e.sku_code = "Required";
    if (!Number.isFinite(plannedNum) || plannedNum < 0) e.units_planned = "Must be ≥ 0";
    if (!Number.isFinite(producedNum) || producedNum < 0)
      e.units_produced = "Must be ≥ 0";
    if (wastage && (!Number.isFinite(wastageNum) || wastageNum < 0))
      e.wastage = "Must be ≥ 0";
    if (ph) {
      const n = Number(ph);
      if (!Number.isFinite(n) || n < 0 || n > 14) e.ph = "0–14";
    }
    if (brix) {
      const n = Number(brix);
      if (!Number.isFinite(n) || n < 0 || n > 100) e.brix = "0–100";
    }
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

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) {
      toast.push("Please fix the highlighted fields", "error");
      return;
    }
    setSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_batch", {
      p_idempotency_key: idempotencyKey,
      p_sku_code: skuCode,
      p_batch_date: batchDate,
      p_units_planned: plannedNum,
      p_units_produced: producedNum,
      p_wastage: wastageNum,
      p_ph: ph ? Number(ph) : null,
      p_brix: brix ? Number(brix) : null,
      p_qc_passed: qcPassed,
      p_qc_notes: qcPassed === false ? qcNotes.trim() || null : null,
      p_staff_name: staffName.trim() || null,
      p_notes: notes.trim() || null,
      p_inputs: inputs.map((it) => ({
        ingredient_code: it.ingredient_code,
        qty_used: it.qty_used,
        unit: it.unit,
        // Empty string = FIFO mode (server picks the oldest active lot).
        lot_id: it.lot_id ?? "",
      })),
    });

    setSubmitting(false);

    if (error) {
      toast.push(error.message || "Couldn't create batch", "error");
      return;
    }
    if (!data) {
      toast.push("Batch created but no ID returned", "error");
      return;
    }

    toast.push("Batch logged", "success");
    router.push(`/dashboard/production/${data as string}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
        <h2 className="font-serif font-bold text-xl text-ink">Production data</h2>

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
            <Label htmlFor="units_produced" required>
              Units produced
            </Label>
            <NumberInput
              id="units_produced"
              min="0"
              step="1"
              value={unitsProduced}
              onChange={(e) => setUnitsProduced(e.target.value)}
              disabled={submitting}
            />
            {yieldOverPlanned ? (
              <p className="text-xs text-yellow font-semibold mt-1">
                Yield {Math.round((producedNum / plannedNum) * 100)}% — above plan.
              </p>
            ) : null}
            {canIngredient && producedNum > 0 ? (
              <p className="text-xs text-peri mt-1">
                Will also deduct {producedNum} {canIngredient.name}
                {producedNum === 1 ? "" : "s"} from FIFO inventory.
              </p>
            ) : null}
            {errors.units_produced ? (
              <p className="text-xs text-coral mt-1">{errors.units_produced}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="wastage">Wastage</Label>
            <NumberInput
              id="wastage"
              min="0"
              step="1"
              value={wastage}
              onChange={(e) => setWastage(e.target.value)}
              disabled={submitting}
            />
            {wastageHigh ? (
              <p className="text-xs text-coral font-semibold mt-1">
                That&apos;s &gt;10% of planned — double-check.
              </p>
            ) : null}
            {errors.wastage ? (
              <p className="text-xs text-coral mt-1">{errors.wastage}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ph">pH</Label>
              <NumberInput
                id="ph"
                min="0"
                max="14"
                step="0.01"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                placeholder="3.50"
                disabled={submitting}
              />
              {errors.ph ? (
                <p className="text-xs text-coral mt-1">{errors.ph}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="brix">Brix</Label>
              <NumberInput
                id="brix"
                min="0"
                max="100"
                step="0.1"
                value={brix}
                onChange={(e) => setBrix(e.target.value)}
                placeholder="12.5"
                disabled={submitting}
              />
              {errors.brix ? (
                <p className="text-xs text-coral mt-1">{errors.brix}</p>
              ) : null}
            </div>
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
            disabled={submitting}
          />
        </div>

        {qcPassed === false ? (
          <div className="space-y-1">
            <Label htmlFor="qc_notes">QC notes</Label>
            <Textarea
              id="qc_notes"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              placeholder="What went wrong?"
              disabled={submitting}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="staff_name">Staff</Label>
            <Input
              id="staff_name"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Who ran the batch?"
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
          unitsProduced={producedNum}
          disabled={submitting}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Logging…" : "Log batch"}
        </Button>
      </div>
    </form>
  );
}
