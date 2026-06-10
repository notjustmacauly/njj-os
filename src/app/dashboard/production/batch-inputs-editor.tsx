"use client";

import * as React from "react";
import { Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IngredientPicker, type IngredientRef } from "@/components/ui/ingredient-picker";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { cn, formatPHP } from "@/lib/utils";

export type LotOption = {
  id: string;
  external_id: string | null;
  ingredient_code: string;
  qty_remaining: number;
  cost_per_unit: number;
  received_date: string;
};

export type BatchInputDraft = {
  /** Local-only key for React rendering. */
  tempId: string;
  /** Optional persisted id — only present for already-saved inputs. */
  id?: string;
  ingredient_code: string;
  qty_used: number;
  unit: string;
  /** null = FIFO mode (server resolves). Set explicitly to override. */
  lot_id: string | null;
  /**
   * Legacy field, kept optional for compatibility with the batch detail
   * page's existing input editor. New rows use lot_id (cost comes from
   * the lot at consumption time).
   */
  cost_per_unit?: number;
};

export function newInputDraft(ingredient: IngredientRef): BatchInputDraft {
  return {
    tempId: crypto.randomUUID(),
    ingredient_code: ingredient.code,
    qty_used: 0,
    unit: ingredient.unit,
    lot_id: null,
  };
}

/**
 * Editable list of ingredient inputs for a batch. Each row resolves to a
 * specific lot — either FIFO (oldest active lot with enough qty, picked
 * client-side as a hint and server-side as the source of truth) or
 * manually overridden via the "Pick specific lot" toggle.
 *
 * Cost no longer comes from the ingredients table — it comes from the lot
 * the input draws from. This matches the deployed create_batch RPC.
 */
export function BatchInputsEditor({
  inputs,
  onChange,
  ingredients,
  lots,
  skuFilter,
  unitsProduced,
  disabled,
  backfill = false,
}: {
  inputs: BatchInputDraft[];
  onChange: (next: BatchInputDraft[]) => void;
  ingredients: IngredientRef[];
  lots: LotOption[];
  skuFilter?: string;
  unitsProduced?: number;
  disabled?: boolean;
  /** When true: skip lot resolution + picker; show optional cost-per-unit
   *  input per row (the estimate stored as cost_per_unit_at_use snapshot). */
  backfill?: boolean;
}) {
  const ingredientByCode = React.useMemo(() => {
    const map: Record<string, IngredientRef> = {};
    for (const i of ingredients) map[i.code] = i;
    return map;
  }, [ingredients]);

  // Lots grouped by ingredient_code, sorted oldest-first.
  const lotsByCode = React.useMemo(() => {
    const map: Record<string, LotOption[]> = {};
    for (const l of lots) {
      const code = l.ingredient_code;
      if (!map[code]) map[code] = [];
      map[code].push(l);
    }
    for (const code of Object.keys(map)) {
      map[code].sort((a, b) =>
        a.received_date < b.received_date ? -1 : a.received_date > b.received_date ? 1 : 0,
      );
    }
    return map;
  }, [lots]);

  const lotById = React.useMemo(() => {
    const map: Record<string, LotOption> = {};
    for (const l of lots) map[l.id] = l;
    return map;
  }, [lots]);

  const usedCodes = inputs.map((i) => i.ingredient_code).filter(Boolean);

  function update(idx: number, patch: Partial<BatchInputDraft>) {
    const next = inputs.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function remove(idx: number) {
    const next = inputs.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  function add() {
    // Prefer an ingredient not used yet; fall back to the first ingredient
    // (duplicates are allowed now — see addLot).
    const taken = new Set(usedCodes);
    const ing = ingredients.find((i) => !taken.has(i.code)) ?? ingredients[0];
    if (!ing) return;
    onChange([...inputs, newInputDraft(ing)]);
  }

  // Split the same ingredient across another lot: clone the row (same
  // ingredient + unit) right below it, in FIFO mode so the user can pin the
  // next lot. This is how you draw e.g. apples from two lots in one batch.
  function addLot(idx: number) {
    const row = inputs[idx];
    const clone: BatchInputDraft = {
      tempId: crypto.randomUUID(),
      ingredient_code: row.ingredient_code,
      qty_used: 0,
      unit: row.unit,
      lot_id: null,
    };
    const next = inputs.slice();
    next.splice(idx + 1, 0, clone);
    onChange(next);
  }

  function changeIngredient(idx: number, code: string) {
    const ing = ingredientByCode[code];
    if (!ing) return;
    // Changing the ingredient invalidates the chosen lot.
    update(idx, { ingredient_code: code, unit: ing.unit, lot_id: null });
  }

  // Resolve which lot each row draws from, for display + subtotal. This is a
  // SEQUENTIAL pass: explicit and FIFO rows both decrement a running tally of
  // each lot's remaining qty, so two rows for the same ingredient correctly
  // draw from different lots (mirrors how the server consumes them in order).
  const rowResolutions = React.useMemo<
    Array<{
      lot: LotOption | null;
      explicit: boolean;
      insufficientForExplicit: boolean;
      fifoUnavailable: boolean;
    }>
  >(() => {
    if (backfill) {
      return inputs.map(() => ({
        lot: null,
        explicit: false,
        insufficientForExplicit: false,
        fifoUnavailable: false,
      }));
    }
    const remaining: Record<string, number> = {};
    for (const l of lots) remaining[l.id] = l.qty_remaining;

    return inputs.map((row) => {
      if (row.lot_id) {
        const lot = lotById[row.lot_id] ?? null;
        const avail = lot ? remaining[lot.id] ?? 0 : 0;
        const insufficient = lot != null && row.qty_used > 0 && avail < row.qty_used;
        if (lot && row.qty_used > 0) remaining[lot.id] = avail - row.qty_used;
        return { lot, explicit: true, insufficientForExplicit: insufficient, fifoUnavailable: false };
      }
      const list = lotsByCode[row.ingredient_code] ?? [];
      if (row.qty_used <= 0) {
        const first = list.find((l) => (remaining[l.id] ?? 0) > 0) ?? list[0] ?? null;
        return { lot: first, explicit: false, insufficientForExplicit: false, fifoUnavailable: false };
      }
      const match = list.find((l) => (remaining[l.id] ?? 0) >= row.qty_used) ?? null;
      if (match) remaining[match.id] = (remaining[match.id] ?? 0) - row.qty_used;
      return { lot: match, explicit: false, insufficientForExplicit: false, fifoUnavailable: match == null };
    });
  }, [inputs, lots, lotById, lotsByCode, backfill]);

  const totalCost = inputs.reduce((sum, row, idx) => {
    if (backfill) {
      const est = Number(row.cost_per_unit ?? 0);
      return sum + row.qty_used * (Number.isFinite(est) ? est : 0);
    }
    const r = rowResolutions[idx];
    if (!r.lot) return sum;
    return sum + row.qty_used * r.lot.cost_per_unit;
  }, 0);
  const costPerCan =
    unitsProduced && unitsProduced > 0 ? totalCost / unitsProduced : null;

  // Duplicates are allowed (same ingredient from multiple lots), so the only
  // requirement to add a row is that at least one ingredient exists.
  const canAdd = ingredients.length > 0;

  return (
    <div className="space-y-3">
      {inputs.length === 0 ? (
        <div className="text-center text-sm text-inkSoft border border-dashed border-border rounded-lg py-6">
          No ingredients yet. Add at least one to track COGS.
        </div>
      ) : (
        <div className="space-y-2">
          {inputs.map((row, idx) => {
            const res = rowResolutions[idx];
            const lot = res.lot;
            const sameIngredientCount = inputs.filter(
              (r) => r.ingredient_code === row.ingredient_code,
            ).length;
            const ingredientLots = lotsByCode[row.ingredient_code] ?? [];
            const estimateCost = Number(row.cost_per_unit ?? 0);
            const subtotal = backfill
              ? row.qty_used * (Number.isFinite(estimateCost) ? estimateCost : 0)
              : lot
                ? row.qty_used * lot.cost_per_unit
                : 0;
            const showError = !backfill && (res.fifoUnavailable || res.insufficientForExplicit);

            return (
              <div
                key={row.tempId}
                className="border border-border rounded-lg p-3 bg-white"
              >
                <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_64px_10ch_2.5rem] gap-2 items-start">
                  <div>
                    <IngredientPicker
                      value={row.ingredient_code}
                      onChange={(code) => changeIngredient(idx, code)}
                      ingredients={ingredients}
                      skuFilter={skuFilter}
                      disabled={disabled}
                    />
                    {sameIngredientCount > 1 ? (
                      <span className="inline-block mt-1 text-[10px] uppercase tracking-smallcaps font-semibold text-berry">
                        Split across {sameIngredientCount} lots
                      </span>
                    ) : null}
                  </div>
                  <NumberInput
                    min="0"
                    step="0.001"
                    value={row.qty_used || ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      update(idx, {
                        qty_used: Number.isFinite(n) && n >= 0 ? n : 0,
                      });
                    }}
                    disabled={disabled}
                    placeholder="qty"
                    aria-label="Qty used"
                    className="h-9"
                  />
                  <Input
                    value={row.unit}
                    readOnly
                    disabled
                    aria-label="Unit"
                    className="h-9 text-center text-inkSoft"
                  />
                  <div className="text-right font-mono font-semibold text-berry pt-1.5">
                    {formatPHP(subtotal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={disabled}
                    className="p-2 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
                    aria-label="Remove ingredient"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2 pl-1">
                  {backfill ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft px-1.5 py-0.5 rounded-md bg-yellowBg text-yellow">
                        Backfill
                      </span>
                      <label className="text-inkSoft flex items-center gap-2">
                        Cost estimate per {row.unit} (optional)
                        <NumberInput
                          prefix="₱"
                          min="0"
                          step="0.01"
                          value={row.cost_per_unit ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            const n = v === "" ? undefined : Number(v);
                            update(idx, {
                              cost_per_unit:
                                n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined,
                            });
                          }}
                          disabled={disabled}
                          className="h-8 w-28"
                        />
                      </label>
                    </div>
                  ) : (
                    <>
                      <LotControl
                        row={row}
                        lots={ingredientLots}
                        resolvedLot={lot}
                        explicit={res.explicit}
                        fifoUnavailable={res.fifoUnavailable}
                        insufficientForExplicit={res.insufficientForExplicit}
                        onPickFifo={() => update(idx, { lot_id: null })}
                        onPickLot={(lotId) => update(idx, { lot_id: lotId })}
                        disabled={disabled}
                      />
                      {showError ? (
                        <p className="text-xs text-coral mt-1">
                          {res.fifoUnavailable
                            ? `No single lot has enough ${row.ingredient_code} for ${row.qty_used}${row.unit}. Use “Split across another lot” below to draw the rest from a second lot.`
                            : `That lot only has ${lot?.qty_remaining}${row.unit} remaining — reduce the qty or split the rest across another lot.`}
                        </p>
                      ) : null}
                      {ingredientLots.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => addLot(idx)}
                          disabled={disabled}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-berry hover:underline disabled:opacity-40"
                        >
                          <Plus className="w-3 h-3" />
                          Split across another lot
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          <div className="bg-cream/40 border border-border rounded-lg px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
              Total ingredient cost
            </span>
            <span className="font-serif font-bold text-lg text-berry">
              {formatPHP(totalCost)}
            </span>
            {costPerCan != null ? (
              <span className="text-xs text-inkSoft basis-full text-right">
                {formatPHP(costPerCan)} per can produced (÷ {unitsProduced})
              </span>
            ) : null}
          </div>
        </div>
      )}

      {canAdd ? (
        <Button
          variant="berryGhost"
          size="sm"
          onClick={add}
          disabled={disabled}
        >
          <Plus className="w-4 h-4" />
          Add ingredient
        </Button>
      ) : (
        <div className="text-xs text-inkSoft">All ingredients added.</div>
      )}
    </div>
  );
}

function LotControl({
  row,
  lots,
  resolvedLot,
  explicit,
  fifoUnavailable,
  insufficientForExplicit,
  onPickFifo,
  onPickLot,
  disabled,
}: {
  row: BatchInputDraft;
  lots: LotOption[];
  resolvedLot: LotOption | null;
  explicit: boolean;
  fifoUnavailable: boolean;
  insufficientForExplicit: boolean;
  onPickFifo: () => void;
  onPickLot: (lotId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(explicit);

  React.useEffect(() => {
    if (explicit) setOpen(true);
  }, [explicit]);

  if (lots.length === 0) {
    return (
      <p className="text-xs text-coral inline-flex items-center gap-1">
        No active lots for this ingredient — log a receipt first.
      </p>
    );
  }

  const summary = explicit ? (
    resolvedLot ? (
      <span>
        <span className="font-mono">{resolvedLot.external_id ?? resolvedLot.id.slice(0, 8)}</span>{" "}
        · {resolvedLot.qty_remaining}
        {row.unit} @ {formatPHP(resolvedLot.cost_per_unit)}/{row.unit}
      </span>
    ) : (
      <span className="text-coral">Selected lot no longer available</span>
    )
  ) : fifoUnavailable ? (
    <span className="text-coral">FIFO: no single lot has enough</span>
  ) : resolvedLot ? (
    <span>
      FIFO:{" "}
      <span className="font-mono">{resolvedLot.external_id ?? resolvedLot.id.slice(0, 8)}</span>{" "}
      · {resolvedLot.qty_remaining}
      {row.unit} @ {formatPHP(resolvedLot.cost_per_unit)}/{row.unit}
    </span>
  ) : (
    <span className="text-inkSoft">Enter a qty to see which lot FIFO picks.</span>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-smallcaps font-semibold",
            explicit
              ? "bg-berryBg text-berry"
              : "bg-cream text-inkSoft border border-border",
          )}
        >
          {explicit ? <Pin className="w-3 h-3" /> : null}
          {explicit ? "Pinned" : "FIFO"}
        </span>
        <span className={fifoUnavailable || insufficientForExplicit ? "text-coral" : "text-inkSoft"}>
          {summary}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto text-berry hover:underline"
          disabled={disabled}
        >
          {open ? "Hide" : "📌 Pick specific lot"}
        </button>
      </div>
      {open ? (
        <div className="flex items-center gap-2">
          <Select
            value={row.lot_id ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") onPickFifo();
              else onPickLot(v);
            }}
            disabled={disabled}
            aria-label="Pick specific lot"
            className="h-9 text-xs flex-1 max-w-md"
          >
            <option value="">FIFO (oldest with enough)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.external_id ?? l.id.slice(0, 8)} · {l.qty_remaining}
                {row.unit} @ {formatPHP(l.cost_per_unit)}/{row.unit} ·{" "}
                received {l.received_date}
              </option>
            ))}
          </Select>
          {explicit ? (
            <button
              type="button"
              onClick={() => {
                onPickFifo();
                setOpen(false);
              }}
              className="text-xs text-inkSoft hover:text-ink inline-flex items-center gap-1"
              disabled={disabled}
            >
              <PinOff className="w-3 h-3" />
              Back to FIFO
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
