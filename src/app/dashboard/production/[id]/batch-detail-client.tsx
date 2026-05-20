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
import { ingredientEmoji } from "@/lib/ingredient-icons";

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
  is_backfill: boolean | null;
};

type InputRow = {
  id: string;
  batch_id: string;
  ingredient_code: string;
  qty_used: number | string;
  unit: string;
  cost_per_unit: number | string;
  lot_id: string | null;
  cost_per_unit_at_use: number | string | null;
  ingredient: { name: string; type: string; unit: string; cost_per_unit: number | string } | null;
  lot:
    | { external_id: string | null; received_date: string; vendor: string | null }
    | { external_id: string | null; received_date: string; vendor: string | null }[]
    | null;
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

function BatchInputsSection({
  label,
  rows,
}: {
  label: string;
  rows: InputRow[];
}) {
  return (
    <tbody>
      <tr className="border-t border-border bg-cream/40">
        <td
          colSpan={5}
          className="px-3 py-1.5 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft"
        >
          {label}
        </td>
      </tr>
      {rows.map((r) => {
        const ingName = pickRel(r.ingredient)?.name ?? r.ingredient_code;
        const lot = pickRel(r.lot);
        const cost =
          r.cost_per_unit_at_use != null
            ? Number(r.cost_per_unit_at_use)
            : Number(r.cost_per_unit ?? 0);
        const sub = Number(r.qty_used) * cost;
        return (
          <tr key={r.id} className="border-t border-border">
            <td className="px-3 py-2.5">
              <span aria-hidden className="mr-1.5">
                {ingredientEmoji(r.ingredient_code)}
              </span>
              <span className="text-ink font-semibold">{ingName}</span>
              <span className="ml-1 text-xs text-inkSoft font-mono">
                {r.ingredient_code}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
              {Number(r.qty_used)} {r.unit}
            </td>
            <td className="px-3 py-2.5 text-xs text-inkSoft font-mono">
              {lot?.external_id ?? (r.lot_id ? r.lot_id.slice(0, 8) : "—")}
            </td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums">
              {formatPHP(cost)}
              {r.cost_per_unit_at_use == null ? (
                <span className="ml-1 text-[10px] uppercase tracking-smallcaps text-yellow">
                  legacy
                </span>
              ) : null}
            </td>
            <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-berry">
              {formatPHP(sub)}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
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

  // ── Inputs: read-only in Phase 1 of inventory ────────────────
  // Editing batch inputs post-creation is deferred — adjusting qty_used
  // without also adjusting the source lot's qty_remaining would desync
  // inventory. Phase 2 will reintroduce edits with proper lot awareness.
  const inputsRows = initialInputs;
  const realCost = inputsRows.reduce((sum, r) => {
    const cost =
      r.cost_per_unit_at_use != null
        ? Number(r.cost_per_unit_at_use)
        : Number(r.cost_per_unit ?? 0);
    return sum + Number(r.qty_used) * cost;
  }, 0);
  const inputsMissingLot = inputsRows.filter(
    (r) => r.cost_per_unit_at_use == null,
  ).length;

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

  // Live cost preview on the inputs side. Inputs are read-only in Phase 1,
  // so this just mirrors the saved real cost.
  const liveCogs = realCost;
  const producedNum = Number(unitsProduced) || 0;
  const liveCostPerCan = producedNum > 0 ? liveCogs / producedNum : null;

  // SKU info for display
  const skuRow = skus.find((s) => s.code === batch.sku_code);
  const skuTone = SKU_TONE[batch.sku_code as keyof typeof SKU_TONE] ?? "default";

  const oversold = inventory && inventory.remaining_signed < 0;

  const isBackfill = batch.is_backfill === true;

  return (
    <div className="space-y-6">
      {isBackfill ? (
        <div className="bg-yellowBg border border-yellow/40 rounded-lg px-4 py-3 flex items-start gap-2 text-sm">
          <span aria-hidden className="text-base leading-none">📚</span>
          <div>
            <div className="font-semibold text-yellow">Historical record (backfilled)</div>
            <div className="text-xs text-yellow/90 mt-0.5">
              This batch was logged during the system transition. No inventory was
              deducted. Cost figures are estimates.
            </div>
          </div>
        </div>
      ) : null}

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

      {/* Ingredients (read-only — Phase 1 of inventory) */}
      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif font-bold text-xl text-ink">Ingredients</h3>
          <span className="text-[10px] uppercase tracking-smallcaps text-inkSoft">
            Read-only
          </span>
        </div>

        {inputsRows.length === 0 ? (
          <p className="text-sm text-inkSoft text-center py-6">
            No ingredient inputs recorded.
          </p>
        ) : (
          (() => {
            const ingredientRows = inputsRows.filter(
              (r) => pickRel(r.ingredient)?.type !== "packaging",
            );
            const packagingRows = inputsRows.filter(
              (r) => pickRel(r.ingredient)?.type === "packaging",
            );
            const perCan =
              Number(batch.units_produced) > 0
                ? realCost / Number(batch.units_produced)
                : null;
            return (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead className="bg-cream text-inkSoft">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold w-32 text-right">Qty used</th>
                      <th className="px-3 py-2 font-semibold w-44">Lot</th>
                      <th className="px-3 py-2 font-semibold w-32 text-right">Cost / unit</th>
                      <th className="px-3 py-2 font-semibold w-32 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  {ingredientRows.length > 0 ? (
                    <BatchInputsSection
                      label="Ingredients"
                      rows={ingredientRows}
                    />
                  ) : null}
                  {packagingRows.length > 0 ? (
                    <BatchInputsSection
                      label="Packaging"
                      rows={packagingRows}
                    />
                  ) : null}
                  <tfoot>
                    <tr className="border-t border-border bg-cream/60">
                      <td colSpan={4} className="px-3 py-3 text-right text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                        {isBackfill ? "Estimated cost" : "Real cost"}
                      </td>
                      <td className="px-3 py-3 text-right font-serif font-bold text-lg text-berry">
                        {formatPHP(realCost)}
                      </td>
                    </tr>
                    {perCan != null ? (
                      <tr>
                        <td colSpan={4} className="px-3 pb-3 text-right text-xs text-inkSoft">
                          Per can ({batch.units_produced} produced)
                        </td>
                        <td className="px-3 pb-3 text-right font-mono text-peri">
                          {formatPHP(perCan)}
                        </td>
                      </tr>
                    ) : null}
                  </tfoot>
                </table>
              </div>
            );
          })()
        )}

        <div className="border-t border-border pt-3 text-xs text-inkSoft space-y-1">
          <div>
            Saved COGS on the batch row:{" "}
            <span className="font-semibold text-berry">{formatPHP(batch.cogs_total)}</span>
          </div>
          {inputsMissingLot > 0 ? (
            <div className="text-yellow">
              {isBackfill ? "Estimated" : "Real"} cost incomplete — {inputsMissingLot} input
              {inputsMissingLot === 1 ? "" : "s"} missing lot data (created before the
              inventory cutover; legacy cost used as fallback).
            </div>
          ) : null}
          <div className="text-[11px] text-inkSoft">
            Lot-aware editing of saved inputs comes in Phase 2. To adjust a batch&rsquo;s
            inputs now, soft-delete it and re-log.
          </div>
        </div>
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
