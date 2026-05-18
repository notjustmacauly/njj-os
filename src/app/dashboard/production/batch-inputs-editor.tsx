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
}: {
  inputs: BatchInputDraft[];
  onChange: (next: BatchInputDraft[]) => void;
  ingredients: IngredientRef[];
  lots: LotOption[];
  skuFilter?: string;
  unitsProduced?: number;
  disabled?: boolean;
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
    const taken = new Set(usedCodes);
    const first = ingredients.find((i) => !taken.has(i.code));
    if (!first) return;
    onChange([...inputs, newInputDraft(first)]);
  }

  function changeIngredient(idx: number, code: string) {
    const ing = ingredientByCode[code];
    if (!ing) return;
    // Changing the ingredient invalidates the chosen lot.
    update(idx, { ingredient_code: code, unit: ing.unit, lot_id: null });
  }

  // Resolve which lot will be used for a row (for display + subtotal).
  function resolveLot(row: BatchInputDraft): {
    lot: LotOption | null;
    explicit: boolean;
    insufficientForExplicit: boolean;
    fifoUnavailable: boolean;
  } {
    if (row.lot_id) {
      const lot = lotById[row.lot_id] ?? null;
      return {
        lot,
        explicit: true,
        insufficientForExplicit:
          lot != null && row.qty_used > 0 && lot.qty_remaining < row.qty_used,
        fifoUnavailable: false,
      };
    }
    const list = lotsByCode[row.ingredient_code] ?? [];
    if (row.qty_used <= 0) {
      // No FIFO match expected until a qty is entered. Show the oldest active
      // lot as a hint of what FIFO would pick if enough.
      const first = list[0] ?? null;
      return { lot: first, explicit: false, insufficientForExplicit: false, fifoUnavailable: false };
    }
    const match = list.find((l) => l.qty_remaining >= row.qty_used) ?? null;
    return {
      lot: match,
      explicit: false,
      insufficientForExplicit: false,
      fifoUnavailable: match == null,
    };
  }

  const rowResolutions = inputs.map(resolveLot);

  const totalCost = inputs.reduce((sum, row, idx) => {
    const r = rowResolutions[idx];
    if (!r.lot) return sum;
    return sum + row.qty_used * r.lot.cost_per_unit;
  }, 0);
  const costPerCan =
    unitsProduced && unitsProduced > 0 ? totalCost / unitsProduced : null;

  const canAdd = ingredients.length > usedCodes.length;

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
            const otherCodes = usedCodes.filter((_, i) => i !== idx);
            const ingredientLots = lotsByCode[row.ingredient_code] ?? [];
            const subtotal = lot ? row.qty_used * lot.cost_per_unit : 0;
            const showError = res.fifoUnavailable || res.insufficientForExplicit;

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
                      excludeCodes={otherCodes}
                      disabled={disabled}
                    />
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
                        ? `No single lot has enough ${row.ingredient_code} for ${row.qty_used}${row.unit}. Split this into two inputs (e.g. ${ingredientLots[0]?.qty_remaining ?? "—"}${row.unit} from ${ingredientLots[0]?.external_id ?? "the oldest"} + the rest from another lot).`
                        : `That lot only has ${lot?.qty_remaining}${row.unit} remaining.`}
                    </p>
                  ) : null}
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
