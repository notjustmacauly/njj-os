"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IngredientPicker, type IngredientRef } from "@/components/ui/ingredient-picker";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { formatPHP } from "@/lib/utils";

export type BatchInputDraft = {
  /** Local-only key for React rendering. New rows have only tempId; persisted rows also have id. */
  tempId: string;
  id?: string;
  ingredient_code: string;
  qty_used: number;
  unit: string;
  cost_per_unit: number;
};

export function newInputDraft(ingredient: IngredientRef): BatchInputDraft {
  return {
    tempId: crypto.randomUUID(),
    ingredient_code: ingredient.code,
    qty_used: 0,
    unit: ingredient.unit,
    cost_per_unit: Number(ingredient.cost_per_unit),
  };
}

/**
 * Editable list of ingredient lines for a batch. Live subtotals + total cost
 * + cost-per-can preview. Mirrors OrderItemsEditor's shape.
 */
export function BatchInputsEditor({
  inputs,
  onChange,
  ingredients,
  skuFilter,
  unitsProduced,
  disabled,
}: {
  inputs: BatchInputDraft[];
  onChange: (next: BatchInputDraft[]) => void;
  ingredients: IngredientRef[];
  skuFilter?: string;
  unitsProduced?: number;
  disabled?: boolean;
}) {
  const ingredientByCode = React.useMemo(() => {
    const map: Record<string, IngredientRef> = {};
    for (const i of ingredients) map[i.code] = i;
    return map;
  }, [ingredients]);

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
    // Prefer an unused ingredient as default; pick the first unused one if any.
    const taken = new Set(usedCodes);
    const first = ingredients.find((i) => !taken.has(i.code));
    if (!first) return;
    onChange([...inputs, newInputDraft(first)]);
  }

  function changeIngredient(idx: number, code: string) {
    const ing = ingredientByCode[code];
    if (!ing) return;
    update(idx, {
      ingredient_code: code,
      unit: ing.unit,
      // Snapshot the current cost when ingredient is picked. User can override.
      cost_per_unit: Number(ing.cost_per_unit),
    });
  }

  const totalCost = inputs.reduce(
    (s, it) => s + Number(it.qty_used) * Number(it.cost_per_unit),
    0,
  );
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
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                <th className="text-left px-2 pb-2 min-w-[14rem]">Ingredient</th>
                <th className="text-left px-2 pb-2 w-28">Qty used</th>
                <th className="text-left px-2 pb-2 w-16">Unit</th>
                <th className="text-left px-2 pb-2 w-32">Cost at time</th>
                <th className="text-right px-2 pb-2 w-28">Subtotal</th>
                <th className="px-2 pb-2 w-10" aria-label="Remove" />
              </tr>
            </thead>
            <tbody className="align-top">
              {inputs.map((row, idx) => {
                const otherCodes = usedCodes.filter(
                  (_, i) => i !== idx,
                );
                return (
                  <tr key={row.tempId} className="border-t border-border">
                    <td className="px-2 py-2">
                      <IngredientPicker
                        value={row.ingredient_code}
                        onChange={(code) => changeIngredient(idx, code)}
                        ingredients={ingredients}
                        skuFilter={skuFilter}
                        excludeCodes={otherCodes}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-2 py-2">
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
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        value={row.unit}
                        readOnly
                        disabled
                        className="h-9 text-center text-inkSoft"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <NumberInput
                        prefix="₱"
                        min="0"
                        step="0.01"
                        value={row.cost_per_unit}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          update(idx, {
                            cost_per_unit: Number.isFinite(n) && n >= 0 ? n : 0,
                          });
                        }}
                        disabled={disabled}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-berry">
                      {formatPHP(Number(row.qty_used) * Number(row.cost_per_unit))}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        disabled={disabled}
                        className="p-2 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
                        aria-label="Remove ingredient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={4} className="px-2 py-3 text-right text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                  Total ingredient cost
                </td>
                <td className="px-2 py-3 text-right font-serif font-bold text-lg text-berry">
                  {formatPHP(totalCost)}
                </td>
                <td />
              </tr>
              {costPerCan != null ? (
                <tr>
                  <td colSpan={4} className="px-2 pb-3 text-right text-xs text-inkSoft">
                    Cost per can produced
                  </td>
                  <td className="px-2 pb-3 text-right text-sm font-semibold text-peri">
                    {formatPHP(costPerCan)}
                    <span className="text-inkSoft ml-1 font-normal">
                      ({formatPHP(totalCost)} ÷ {unitsProduced})
                    </span>
                  </td>
                  <td />
                </tr>
              ) : null}
            </tfoot>
          </table>
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
