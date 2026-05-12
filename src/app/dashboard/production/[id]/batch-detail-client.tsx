"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, MoreVertical, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateInput } from "@/components/ui/date-input";
import type { IngredientRef } from "@/components/ui/ingredient-picker";
import { Input } from "@/components/ui/input";
import { InventoryBadge } from "@/components/ui/inventory-badge";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { TriStateRadio } from "@/components/ui/tri-state-radio";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatPHP } from "@/lib/utils";
import {
  BatchInputsEditor,
  type BatchInputDraft,
} from "../batch-inputs-editor";

const SKU_TONE = {
  PCL: "berry",
  ACG: "peri",
  WPM: "coral",
} as const;

type BatchRecord = {
  id: string;
  external_id: string | null;
  batch_date: string;
  sku_code: string;
  units_planned: number;
  units_produced: number;
  wastage: number;
  ph: number | string | null;
  brix: number | string | null;
  qc_passed: boolean | null;
  qc_notes: string | null;
  staff_name: string | null;
  cogs_total: number | string;
  notes: string | null;
};

type InputRow = {
  id: string;
  batch_id: string;
  ingredient_code: string;
  qty_used: number | string;
  unit: string;
  cost_per_unit: number | string;
  ingredient: { name: string; type: string; unit: string; cost_per_unit: number | string } | null;
};

type Inventory = {
  remaining: number;
  remaining_signed: number;
  sold_via_orders: number;
  sold_via_pos: number;
  deducted: number;
  units_produced: number;
  sku_code: string;
};

type OrderUse = {
  qty: number;
  order: {
    id: string;
    external_id: string | null;
    order_date: string;
    channel: string;
  } | null;
};

type PosUse = {
  qty: number;
  transaction: {
    id: string;
    external_id: string | null;
    transaction_date: string;
  } | null;
};

type DeductionUse = {
  qty: number;
  deduction: {
    id: string;
    external_id: string | null;
    deduction_date: string;
    reason: string | null;
  } | null;
};

function pickRel<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function toDraft(r: InputRow): BatchInputDraft {
  return {
    tempId: r.id,
    id: r.id,
    ingredient_code: r.ingredient_code,
    qty_used: Number(r.qty_used),
    unit: r.unit,
    cost_per_unit: Number(r.cost_per_unit),
  };
}

export function BatchDetailClient({
  batch,
  initialInputs,
  inventory,
  skus,
  ingredients,
  usedInOrders,
  usedInPos,
  usedInDeductions,
  canManage,
  canDelete,
}: {
  batch: BatchRecord;
  initialInputs: InputRow[];
  inventory: Inventory | null;
  skus: Array<{ code: string; name: string; short_label: string }>;
  ingredients: IngredientRef[];
  usedInOrders: OrderUse[];
  usedInPos: PosUse[];
  usedInDeductions: DeductionUse[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  // ── Header / metadata state ─────────────────────────────────
  const [batchDate, setBatchDate] = React.useState(batch.batch_date);
  const [unitsPlanned, setUnitsPlanned] = React.useState(String(batch.units_planned));
  const [unitsProduced, setUnitsProduced] = React.useState(String(batch.units_produced));
  const [wastage, setWastage] = React.useState(String(batch.wastage));
  const [ph, setPh] = React.useState(batch.ph != null ? String(batch.ph) : "");
  const [brix, setBrix] = React.useState(batch.brix != null ? String(batch.brix) : "");
  const [qcPassed, setQcPassed] = React.useState<boolean | null>(batch.qc_passed);
  const [qcNotes, setQcNotes] = React.useState(batch.qc_notes ?? "");
  const [staffName, setStaffName] = React.useState(batch.staff_name ?? "");
  const [notes, setNotes] = React.useState(batch.notes ?? "");
  const [savingMeta, setSavingMeta] = React.useState(false);

  const metaDirty =
    batchDate !== batch.batch_date ||
    Number(unitsPlanned) !== Number(batch.units_planned) ||
    Number(unitsProduced) !== Number(batch.units_produced) ||
    Number(wastage) !== Number(batch.wastage) ||
    (ph === "" ? null : Number(ph)) !==
      (batch.ph == null ? null : Number(batch.ph)) ||
    (brix === "" ? null : Number(brix)) !==
      (batch.brix == null ? null : Number(batch.brix)) ||
    qcPassed !== batch.qc_passed ||
    qcNotes !== (batch.qc_notes ?? "") ||
    staffName !== (batch.staff_name ?? "") ||
    notes !== (batch.notes ?? "");

  async function saveMeta() {
    if (!canManage || !metaDirty || savingMeta) return;
    setSavingMeta(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("batches")
      .update({
        batch_date: batchDate,
        units_planned: Number(unitsPlanned) || 0,
        units_produced: Number(unitsProduced) || 0,
        wastage: Number(wastage) || 0,
        ph: ph === "" ? null : Number(ph),
        brix: brix === "" ? null : Number(brix),
        qc_passed: qcPassed,
        qc_notes: qcPassed === false ? qcNotes.trim() || null : null,
        staff_name: staffName.trim() || null,
        notes: notes.trim() || null,
      })
      .eq("id", batch.id);
    setSavingMeta(false);
    if (error) {
      toast.push(error.message || "Couldn't save", "error");
      return;
    }
    toast.push("Batch saved", "success");
    router.refresh();
  }

  // ── Inputs state ────────────────────────────────────────────
  const initialDrafts = React.useMemo(
    () => initialInputs.map(toDraft),
    [initialInputs],
  );
  const [inputs, setInputs] = React.useState<BatchInputDraft[]>(initialDrafts);
  const [savingInputs, setSavingInputs] = React.useState(false);

  const inputsDirty =
    inputs.length !== initialDrafts.length ||
    inputs.some((it) => {
      const prev = initialDrafts.find((d) => d.id === it.id);
      if (!prev) return true;
      return (
        prev.ingredient_code !== it.ingredient_code ||
        Number(prev.qty_used) !== Number(it.qty_used) ||
        Number(prev.cost_per_unit) !== Number(it.cost_per_unit)
      );
    });

  async function saveInputs() {
    if (!canManage || !inputsDirty || savingInputs) return;
    setSavingInputs(true);
    const supabase = createClient();

    const initialIds = new Set(initialDrafts.map((d) => d.id));
    const currentIds = new Set(inputs.filter((i) => i.id).map((i) => i.id!));
    const removed = initialDrafts.filter((d) => d.id && !currentIds.has(d.id));
    const added = inputs.filter((i) => !i.id);
    const updated = inputs.filter((i) => {
      if (!i.id || !initialIds.has(i.id)) return false;
      const prev = initialDrafts.find((d) => d.id === i.id)!;
      return (
        prev.ingredient_code !== i.ingredient_code ||
        Number(prev.qty_used) !== Number(i.qty_used) ||
        Number(prev.cost_per_unit) !== Number(i.cost_per_unit)
      );
    });

    try {
      // Delete first to avoid (batch_id, ingredient_code) unique collisions
      if (removed.length > 0) {
        const { error } = await supabase
          .from("batch_inputs")
          .delete()
          .in("id", removed.map((d) => d.id!));
        if (error) throw error;
      }
      for (const u of updated) {
        const { error } = await supabase
          .from("batch_inputs")
          .update({
            ingredient_code: u.ingredient_code,
            qty_used: u.qty_used,
            unit: u.unit,
            cost_per_unit: u.cost_per_unit,
          })
          .eq("id", u.id!);
        if (error) throw error;
      }
      if (added.length > 0) {
        const { error } = await supabase.from("batch_inputs").insert(
          added.map((a) => ({
            batch_id: batch.id,
            ingredient_code: a.ingredient_code,
            qty_used: a.qty_used,
            unit: a.unit,
            cost_per_unit: a.cost_per_unit,
          })),
        );
        if (error) throw error;
      }
      toast.push("Ingredients saved", "success");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't save inputs";
      toast.push(msg, "error");
    } finally {
      setSavingInputs(false);
    }
  }

  function resetInputs() {
    setInputs(initialDrafts.map((d) => ({ ...d })));
  }

  // ── Soft-delete ──────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  async function softDelete() {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("batches")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", batch.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      toast.push(error.message || "Couldn't delete", "error");
      return;
    }
    toast.push("Batch deleted", "success");
    router.push("/dashboard/production");
    router.refresh();
  }

  // Live cost preview on the inputs side
  const liveCogs = inputs.reduce(
    (s, it) => s + Number(it.qty_used) * Number(it.cost_per_unit),
    0,
  );
  const producedNum = Number(unitsProduced) || 0;
  const liveCostPerCan = producedNum > 0 ? liveCogs / producedNum : null;

  // SKU info for display
  const skuRow = skus.find((s) => s.code === batch.sku_code);
  const skuTone = SKU_TONE[batch.sku_code as keyof typeof SKU_TONE] ?? "default";

  const oversold = inventory && inventory.remaining_signed < 0;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                {batch.external_id ?? "—"}
              </span>
              <span className="text-inkSoft">·</span>
              <h2 className="font-serif font-bold text-2xl text-ink truncate">
                {skuRow ? `${skuRow.short_label} — ${skuRow.name}` : batch.sku_code}
              </h2>
              <Badge tone={skuTone}>{batch.sku_code}</Badge>
              {batch.qc_passed === true ? (
                <span className="text-xs font-semibold text-green bg-greenBg px-2 py-0.5 rounded-full">
                  ✓ QC Passed
                </span>
              ) : batch.qc_passed === false ? (
                <span className="text-xs font-semibold text-coral bg-salmonBg px-2 py-0.5 rounded-full">
                  ✕ QC Failed
                </span>
              ) : (
                <span className="text-xs font-semibold text-inkSoft bg-creamDk px-2 py-0.5 rounded-full">
                  QC pending
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-inkSoft">
              <span>{formatDate(batch.batch_date)}</span>
              <span>·</span>
              <span>{batch.units_planned} planned</span>
              <span>·</span>
              <span>{batch.units_produced} produced</span>
              {liveCostPerCan != null ? (
                <>
                  <span>·</span>
                  <span className="font-semibold text-berry">
                    {formatPHP(liveCostPerCan)}/can
                  </span>
                </>
              ) : null}
            </div>
            {inventory ? (
              <div className="mt-3 text-sm text-inkSoft flex items-center gap-2">
                <span className="text-xs uppercase tracking-smallcaps font-semibold">
                  Inventory
                </span>
                <InventoryBadge
                  remaining={inventory.remaining_signed}
                  produced={inventory.units_produced}
                />
                <span>
                  · sold {inventory.sold_via_orders + inventory.sold_via_pos}
                  {inventory.deducted > 0 ? ` · deducted ${inventory.deducted}` : ""}
                </span>
              </div>
            ) : null}
          </div>

          {canDelete ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className="p-1.5 rounded-md hover:bg-cream text-inkSoft hover:text-ink"
                aria-label="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 mt-1 w-44 bg-white border border-border rounded-md shadow-card py-1 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-coral hover:bg-salmonBg"
                  >
                    <Trash2 className="w-4 h-4" />
                    Soft-delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {oversold ? (
        <div className="bg-salmonBg border border-coral/40 rounded-lg px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-coral mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-coral">
              Oversold by {Math.abs(inventory!.remaining_signed)} cans
            </p>
            <p className="text-sm text-inkSoft mt-1">
              More cans have been allocated than were produced. Check the linked
              orders/POS/deductions below to find the discrepancy.
            </p>
          </div>
        </div>
      ) : null}

      {/* Production data */}
      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif font-bold text-xl text-ink">Production data</h3>
          {metaDirty ? (
            <span className="text-xs text-yellow font-semibold">Unsaved changes</span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="bd_date" required>Batch date</Label>
            <DateInput
              id="bd_date"
              value={batchDate}
              onChange={(e) => setBatchDate(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label>SKU</Label>
            <div className="text-sm text-ink py-2">
              {skuRow ? `${skuRow.short_label} — ${skuRow.name}` : batch.sku_code}
            </div>
            <p className="text-xs text-inkSoft">
              SKU can&apos;t be changed after creation.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="bd_planned" required>Units planned</Label>
            <NumberInput
              id="bd_planned"
              min="0"
              step="1"
              value={unitsPlanned}
              onChange={(e) => setUnitsPlanned(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bd_produced" required>Units produced</Label>
            <NumberInput
              id="bd_produced"
              min="0"
              step="1"
              value={unitsProduced}
              onChange={(e) => setUnitsProduced(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bd_wastage">Wastage</Label>
            <NumberInput
              id="bd_wastage"
              min="0"
              step="1"
              value={wastage}
              onChange={(e) => setWastage(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bd_ph">pH</Label>
              <NumberInput
                id="bd_ph"
                min="0"
                max="14"
                step="0.01"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                disabled={!canManage || savingMeta}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bd_brix">Brix</Label>
              <NumberInput
                id="bd_brix"
                min="0"
                max="100"
                step="0.1"
                value={brix}
                onChange={(e) => setBrix(e.target.value)}
                disabled={!canManage || savingMeta}
              />
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
            disabled={!canManage || savingMeta}
          />
        </div>

        {qcPassed === false ? (
          <div className="space-y-1">
            <Label htmlFor="bd_qcn">QC notes</Label>
            <Textarea
              id="bd_qcn"
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="bd_staff">Staff</Label>
            <Input
              id="bd_staff"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="bd_notes">Notes</Label>
          <Textarea
            id="bd_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canManage || savingMeta}
          />
        </div>

        {canManage ? (
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              onClick={saveMeta}
              disabled={!metaDirty || savingMeta}
            >
              {savingMeta ? "Saving…" : "Save details"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Ingredients */}
      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif font-bold text-xl text-ink">Ingredients</h3>
          {inputsDirty ? (
            <span className="text-xs text-yellow font-semibold">Unsaved changes</span>
          ) : null}
        </div>

        <BatchInputsEditor
          inputs={inputs}
          onChange={setInputs}
          ingredients={ingredients}
          skuFilter={batch.sku_code}
          unitsProduced={producedNum}
          disabled={!canManage || savingInputs}
        />

        <div className="border-t border-border pt-3 text-xs text-inkSoft">
          Saved COGS on the batch row: <span className="font-semibold text-berry">{formatPHP(batch.cogs_total)}</span>
          {inputsDirty ? " · live preview shown above" : ""}
        </div>

        {canManage ? (
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetInputs}
              disabled={!inputsDirty || savingInputs}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={saveInputs}
              disabled={!inputsDirty || savingInputs}
            >
              {savingInputs ? "Saving…" : "Save ingredients"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Linked records */}
      <LinkedRecords
        usedInOrders={usedInOrders}
        usedInPos={usedInPos}
        usedInDeductions={usedInDeductions}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Soft-delete this batch?"
        description={`Batch ${batch.external_id ?? ""} will be hidden from lists and inventory. Existing orders/POS/deductions referencing it stay intact.`}
        confirmLabel="Delete batch"
        destructive
        busy={deleting}
        onConfirm={softDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function LinkedRecords({
  usedInOrders,
  usedInPos,
  usedInDeductions,
}: {
  usedInOrders: OrderUse[];
  usedInPos: PosUse[];
  usedInDeductions: DeductionUse[];
}) {
  const ordersTotal = usedInOrders.reduce((s, r) => s + Number(r.qty), 0);
  const posTotal = usedInPos.reduce((s, r) => s + Number(r.qty), 0);
  const dedTotal = usedInDeductions.reduce((s, r) => s + Number(r.qty), 0);

  if (usedInOrders.length === 0 && usedInPos.length === 0 && usedInDeductions.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-card p-6">
        <h3 className="font-serif font-bold text-xl text-ink mb-2">Linked records</h3>
        <p className="text-sm text-inkSoft">
          Nothing referencing this batch yet — no orders, POS sales, or deductions have used it.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-5">
      <h3 className="font-serif font-bold text-xl text-ink">Linked records</h3>

      {usedInOrders.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
            Used in {usedInOrders.length} {usedInOrders.length === 1 ? "order" : "orders"} · {ordersTotal} cans
          </div>
          <ul className="space-y-1">
            {usedInOrders.map((r, i) => {
              const o = pickRel(r.order);
              if (!o) return null;
              return (
                <li key={`${o.id}-${i}`} className="text-sm flex items-center gap-3">
                  <Link
                    href={`/dashboard/orders/${o.id}`}
                    className="font-mono text-xs text-berry hover:underline"
                  >
                    {o.external_id ?? "—"}
                  </Link>
                  <span className="text-xs text-inkSoft">{formatDate(o.order_date)}</span>
                  <span className="text-xs text-inkSoft">{o.channel}</span>
                  <span className="ml-auto font-mono text-xs">{r.qty} cans</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {usedInPos.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
            Used in {usedInPos.length} POS {usedInPos.length === 1 ? "sale" : "sales"} · {posTotal} cans
          </div>
          <ul className="space-y-1">
            {usedInPos.map((r, i) => {
              const t = pickRel(r.transaction);
              if (!t) return null;
              return (
                <li key={`${t.id}-${i}`} className="text-sm flex items-center gap-3">
                  <span className="font-mono text-xs text-ink">{t.external_id ?? "—"}</span>
                  <span className="text-xs text-inkSoft">{formatDate(t.transaction_date)}</span>
                  <span className="ml-auto font-mono text-xs">{r.qty} cans</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {usedInDeductions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
            Used in {usedInDeductions.length} {usedInDeductions.length === 1 ? "deduction" : "deductions"} · {dedTotal} cans
          </div>
          <ul className="space-y-1">
            {usedInDeductions.map((r, i) => {
              const d = pickRel(r.deduction);
              if (!d) return null;
              return (
                <li key={`${d.id}-${i}`} className="text-sm flex items-center gap-3">
                  <span className="font-mono text-xs text-ink">{d.external_id ?? "—"}</span>
                  <span className="text-xs text-inkSoft">{formatDate(d.deduction_date)}</span>
                  {d.reason ? (
                    <span className="text-xs text-inkSoft truncate">{d.reason}</span>
                  ) : null}
                  <span className="ml-auto font-mono text-xs">{r.qty} cans</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
