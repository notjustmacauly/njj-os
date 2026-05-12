"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { formatPHP } from "@/lib/utils";

export type SkuRef = {
  code: string;
  name: string;
  short_label: string;
  retail_price: number | string;
};

export type TierRef = {
  code: string;
  price_pcl: number | string;
  price_acg: number | string;
  price_wpm: number | string;
};

export type PartnerRef = {
  id: string;
  tier_code: string;
  price_pcl: number | string | null;
  price_acg: number | string | null;
  price_wpm: number | string | null;
};

export type BatchRef = {
  id: string;
  external_id: string;
  remaining: number;
};

export type OrderItemDraft = {
  /** Local-only key for React rendering. New items have tempId; persisted items also have id. */
  tempId: string;
  id?: string;
  sku_code: string;
  qty: number;
  unit_price: number;
  batch_id: string | null;
};

const PRICE_FIELDS: Record<string, "price_pcl" | "price_acg" | "price_wpm"> = {
  PCL: "price_pcl",
  ACG: "price_acg",
  WPM: "price_wpm",
};

/**
 * Resolves the default unit price for a SKU using the same fallback chain
 * as the Postgres `partner_price_for_sku()` function:
 *   partner override → tier default → SKU retail.
 */
export function resolveUnitPrice({
  skuCode,
  partner,
  tiers,
  skus,
}: {
  skuCode: string;
  partner: PartnerRef | null;
  tiers: TierRef[];
  skus: SkuRef[];
}): number {
  const field = PRICE_FIELDS[skuCode];
  if (partner && field) {
    const override = partner[field];
    if (override != null && override !== "") return Number(override);
    const tier = tiers.find((t) => t.code === partner.tier_code);
    if (tier) {
      const tierPrice = tier[field];
      if (tierPrice != null) return Number(tierPrice);
    }
  }
  const sku = skus.find((s) => s.code === skuCode);
  return sku ? Number(sku.retail_price) : 0;
}

export function newDraft(
  skuCode: string,
  partner: PartnerRef | null,
  tiers: TierRef[],
  skus: SkuRef[],
): OrderItemDraft {
  return {
    tempId: crypto.randomUUID(),
    sku_code: skuCode,
    qty: 1,
    unit_price: resolveUnitPrice({ skuCode, partner, tiers, skus }),
    batch_id: null,
  };
}

export function OrderItemsEditor({
  items,
  onChange,
  skus,
  tiers,
  partner,
  batchesBySku,
  disabled,
}: {
  items: OrderItemDraft[];
  onChange: (items: OrderItemDraft[]) => void;
  skus: SkuRef[];
  tiers: TierRef[];
  partner: PartnerRef | null;
  batchesBySku: Record<string, BatchRef[]>;
  disabled?: boolean;
}) {
  const usedSkus = new Set(items.map((i) => i.sku_code));
  const availableSkus = skus.filter((s) => !usedSkus.has(s.code));

  function update(idx: number, patch: Partial<OrderItemDraft>) {
    const next = items.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function remove(idx: number) {
    const next = items.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  function add() {
    const sku = availableSkus[0];
    if (!sku) return;
    onChange([...items, newDraft(sku.code, partner, tiers, skus)]);
  }

  function changeSku(idx: number, newSku: string) {
    if (usedSkus.has(newSku) && items[idx].sku_code !== newSku) return;
    const price = resolveUnitPrice({ skuCode: newSku, partner, tiers, skus });
    update(idx, {
      sku_code: newSku,
      unit_price: price,
      batch_id: null,
    });
  }

  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="text-center text-sm text-inkSoft border border-dashed border-border rounded-lg py-6">
          No line items yet. Add at least one to save.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                <th className="text-left px-2 pb-2 w-28">SKU</th>
                <th className="text-left px-2 pb-2 w-24">Qty</th>
                <th className="text-left px-2 pb-2 w-32">Unit price</th>
                <th className="text-left px-2 pb-2 min-w-[12rem]">Batch</th>
                <th className="text-right px-2 pb-2 w-28">Subtotal</th>
                <th className="px-2 pb-2 w-10" aria-label="Remove" />
              </tr>
            </thead>
            <tbody className="align-top">
              {items.map((item, idx) => {
                const tierPrice = resolveUnitPrice({
                  skuCode: item.sku_code,
                  partner,
                  tiers,
                  skus,
                });
                const batches = batchesBySku[item.sku_code] ?? [];
                const skuOptions = skus.map((s) => ({
                  value: s.code,
                  label: `${s.short_label} — ${s.name}`,
                }));
                const batchOptions = [
                  { value: "", label: "— no batch —" },
                  ...batches.map((b) => ({
                    value: b.id,
                    label: b.external_id,
                    hint: `${b.remaining} left`,
                  })),
                ];
                return (
                  <tr key={item.tempId} className="border-t border-border">
                    <td className="px-2 py-2">
                      <select
                        value={item.sku_code}
                        onChange={(e) => changeSku(idx, e.target.value)}
                        disabled={disabled}
                        className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry disabled:bg-cream"
                      >
                        {skuOptions.map((o) => {
                          const used = usedSkus.has(o.value) && o.value !== item.sku_code;
                          return (
                            <option key={o.value} value={o.value} disabled={used}>
                              {o.label}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <NumberInput
                        min="1"
                        step="1"
                        value={item.qty}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          update(idx, { qty: Number.isFinite(n) && n > 0 ? n : 1 });
                        }}
                        disabled={disabled}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <NumberInput
                        prefix="₱"
                        min="0"
                        step="1"
                        value={item.unit_price}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          update(idx, { unit_price: Number.isFinite(n) ? n : 0 });
                        }}
                        placeholder={`auto (₱${tierPrice})`}
                        disabled={disabled}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Combobox
                        value={item.batch_id ?? ""}
                        onChange={(v) => update(idx, { batch_id: v || null })}
                        options={batchOptions}
                        placeholder="— no batch —"
                        emptyMessage="No batches with stock"
                        disabled={disabled}
                        clearable={false}
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-berry">
                      {formatPHP(item.qty * item.unit_price)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        disabled={disabled}
                        className="p-2 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
                        aria-label="Remove line"
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
                  Items subtotal
                </td>
                <td className="px-2 py-3 text-right font-serif font-bold text-lg text-berry">
                  {formatPHP(subtotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {availableSkus.length > 0 ? (
        <Button
          variant="berryGhost"
          size="sm"
          onClick={add}
          disabled={disabled}
        >
          <Plus className="w-4 h-4" />
          Add line
        </Button>
      ) : (
        <div className="text-xs text-inkSoft">All SKUs added.</div>
      )}
    </div>
  );
}

/** Convenience: hide a label that wraps the editor in form layouts. */
export function ItemsSectionHeader({
  title = "Order items",
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{title}</Label>
      {hint ? <p className="text-xs text-inkSoft">{hint}</p> : null}
    </div>
  );
}
