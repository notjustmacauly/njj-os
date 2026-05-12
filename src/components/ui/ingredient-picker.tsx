"use client";

import * as React from "react";
import { Combobox } from "./combobox";
import { formatPHP } from "@/lib/utils";

export type IngredientRef = {
  code: string;
  name: string;
  type: string;
  unit: string;
  cost_per_unit: number | string;
};

/**
 * Maps a SKU code to the codes of its primary ingredients. The picker
 * shows these first when no search is typed; the rest are still selectable
 * from the dropdown — typing into the search opens the full catalog.
 */
const SKU_PRIMARY: Record<string, string[]> = {
  PCL: ["PINEAPPLE", "COCONUT", "LIME"],
  ACG: ["APPLE", "CARROT", "GINGER"],
  WPM: ["WATERMELON", "PASSIONFRUIT", "MINT"],
};

/**
 * Combobox preset wired with ingredients data + SKU-aware ordering.
 * Pass `skuFilter` to surface a SKU's primary ingredients at the top.
 */
export function IngredientPicker({
  value,
  onChange,
  ingredients,
  skuFilter,
  excludeCodes = [],
  disabled,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  ingredients: IngredientRef[];
  skuFilter?: string;
  excludeCodes?: string[];
  disabled?: boolean;
  className?: string;
}) {
  const exclude = new Set(excludeCodes);
  const primarySet = new Set(SKU_PRIMARY[skuFilter ?? ""] ?? []);

  const ordered = [...ingredients].sort((a, b) => {
    const aPrimary = primarySet.has(a.code) ? 0 : 1;
    const bPrimary = primarySet.has(b.code) ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    return a.name.localeCompare(b.name);
  });

  const options = ordered
    .filter((i) => !exclude.has(i.code) || i.code === value)
    .map((i) => ({
      value: i.code,
      label: i.name,
      hint: `${i.type} · ${i.unit} · ${formatPHP(i.cost_per_unit)}`,
    }));

  return (
    <Combobox
      ariaLabel="Ingredient"
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Pick an ingredient…"
      emptyMessage="No ingredients match"
      disabled={disabled}
      clearable={false}
      className={className}
    />
  );
}
