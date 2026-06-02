"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type DeliverBatchOption = {
  id: string;
  external_id: string | null;
  remaining: number;
  batch_date: string;
};

type Item = {
  id: string;
  sku_code: string;
  qty: number;
};

type AllocationRow = {
  tempId: string;
  batch_id: string;
  qty: number;
};

type ItemAllocations = Record<string, AllocationRow[]>;

function fifoFor(item: Item, batches: DeliverBatchOption[]): AllocationRow[] {
  // Oldest first (server uses received_date / created_at; here we approximate by batch_date asc)
  const sorted = [...batches].sort((a, b) =>
    a.batch_date < b.batch_date ? -1 : a.batch_date > b.batch_date ? 1 : 0,
  );
  const rows: AllocationRow[] = [];
  let need = item.qty;
  for (const b of sorted) {
    if (need <= 0) break;
    if (b.remaining <= 0) continue;
    const take = Math.min(need, b.remaining);
    rows.push({
      tempId: crypto.randomUUID(),
      batch_id: b.id,
      qty: take,
    });
    need -= take;
  }
  return rows;
}

export function DeliverOrderModal({
  open,
  onClose,
  orderId,
  externalId,
  items,
  batchesBySku,
  canOverride = false,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  externalId: string | null;
  items: Item[];
  batchesBySku: Record<string, DeliverBatchOption[]>;
  canOverride?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [allocs, setAllocs] = React.useState<ItemAllocations>({});
  const [busy, setBusy] = React.useState(false);
  const [override, setOverride] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    // Seed FIFO defaults each time the modal opens.
    const seed: ItemAllocations = {};
    for (const it of items) {
      const opts = batchesBySku[it.sku_code] ?? [];
      seed[it.id] = fifoFor(it, opts);
    }
    setAllocs(seed);
    setOverride(false);
  }, [open, items, batchesBySku]);

  function updateRow(itemId: string, idx: number, patch: Partial<AllocationRow>) {
    setAllocs((prev) => {
      const next = { ...prev };
      const list = (next[itemId] ?? []).slice();
      list[idx] = { ...list[idx], ...patch };
      next[itemId] = list;
      return next;
    });
  }

  function addRow(item: Item) {
    setAllocs((prev) => {
      const next = { ...prev };
      const opts = batchesBySku[item.sku_code] ?? [];
      const used = new Set((next[item.id] ?? []).map((r) => r.batch_id));
      const firstUnused = opts.find((b) => !used.has(b.id));
      const list = (next[item.id] ?? []).slice();
      list.push({
        tempId: crypto.randomUUID(),
        batch_id: firstUnused?.id ?? "",
        qty: 0,
      });
      next[item.id] = list;
      return next;
    });
  }

  function removeRow(itemId: string, idx: number) {
    setAllocs((prev) => {
      const next = { ...prev };
      const list = (next[itemId] ?? []).slice();
      list.splice(idx, 1);
      next[itemId] = list;
      return next;
    });
  }

  // Per-item totals + validity
  const itemSummaries = items.map((it) => {
    const rows = allocs[it.id] ?? [];
    const sum = rows.reduce((s, r) => s + (Number.isFinite(r.qty) ? r.qty : 0), 0);
    const seenBatches = new Set<string>();
    let duplicateBatch = false;
    for (const r of rows) {
      if (r.batch_id && seenBatches.has(r.batch_id)) duplicateBatch = true;
      if (r.batch_id) seenBatches.add(r.batch_id);
    }
    const missingBatch = rows.some((r) => !r.batch_id);
    const nonPositive = rows.some((r) => !Number.isFinite(r.qty) || r.qty <= 0);
    return {
      item: it,
      rows,
      sum,
      needed: it.qty,
      match: sum === it.qty,
      duplicateBatch,
      missingBatch,
      nonPositive,
    };
  });

  const allValid = itemSummaries.every(
    (s) => s.match && !s.duplicateBatch && !s.missingBatch && !s.nonPositive,
  );

  async function submit() {
    if (!allValid) {
      toast.push("Fix allocation errors before delivering", "error");
      return;
    }
    const payload: Array<{ order_item_id: string; batch_id: string; qty: number }> = [];
    for (const s of itemSummaries) {
      for (const r of s.rows) {
        payload.push({
          order_item_id: s.item.id,
          batch_id: r.batch_id,
          qty: r.qty,
        });
      }
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("deliver_order", {
      p_order_id: orderId,
      p_allocations: payload,
      p_allow_override: canOverride && override,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't deliver order", "error");
      return;
    }
    toast.push(`Order ${externalId ?? ""} delivered`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Deliver order"
      description="Pulls cans from one or more batches and marks the order delivered."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !allValid}>
            {busy ? "Delivering…" : "Deliver"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {itemSummaries.length === 0 ? (
          <p className="text-sm text-inkSoft">This order has no line items.</p>
        ) : null}
        {itemSummaries.map((s) => {
          const opts = batchesBySku[s.item.sku_code] ?? [];
          return (
            <div
              key={s.item.id}
              className="rounded-lg border border-border bg-cream/30 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="font-semibold text-ink">{s.item.sku_code}</span>
                  <span className="text-inkSoft text-sm ml-2">
                    × {s.item.qty} cans
                  </span>
                </div>
                <div className="text-xs">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      s.match
                        ? "text-green"
                        : s.sum > s.needed
                          ? "text-coral"
                          : "text-yellow",
                    )}
                  >
                    {s.sum} / {s.needed} allocated
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {s.rows.length === 0 ? (
                  <p className="text-xs text-coral">
                    No allocations yet. Add a batch below.
                  </p>
                ) : (
                  s.rows.map((row, idx) => {
                    const batch = opts.find((b) => b.id === row.batch_id);
                    const exceeds =
                      batch != null && row.qty > batch.remaining;
                    return (
                      <div
                        key={row.tempId}
                        className="grid grid-cols-[1fr_100px_2.5rem] gap-2 items-start"
                      >
                        <Select
                          value={row.batch_id}
                          onChange={(e) =>
                            updateRow(s.item.id, idx, { batch_id: e.target.value })
                          }
                          aria-label="Batch"
                          className="h-9 text-xs"
                          disabled={busy}
                        >
                          <option value="">Pick a batch…</option>
                          {opts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.external_id ?? b.id.slice(0, 8)} · {b.remaining}{" "}
                              remaining · {b.batch_date}
                            </option>
                          ))}
                        </Select>
                        <NumberInput
                          min="1"
                          step="1"
                          value={row.qty || ""}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            updateRow(s.item.id, idx, {
                              qty: Number.isFinite(n) && n >= 0 ? n : 0,
                            });
                          }}
                          aria-label="Qty"
                          className="h-9 text-right"
                          disabled={busy}
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(s.item.id, idx)}
                          disabled={busy}
                          className="p-2 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
                          aria-label="Remove allocation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {exceeds ? (
                          <p className="col-span-3 text-xs text-coral -mt-1">
                            Only {batch?.remaining} left in that batch.
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="berryGhost"
                  onClick={() => addRow(s.item)}
                  disabled={busy}
                >
                  <Plus className="w-4 h-4" />
                  Add batch
                </Button>
                {s.duplicateBatch ? (
                  <p className="text-xs text-coral">
                    Each batch can only appear once per line item.
                  </p>
                ) : null}
                {s.missingBatch ? (
                  <p className="text-xs text-coral">Every row needs a batch.</p>
                ) : null}
                {s.nonPositive ? (
                  <p className="text-xs text-coral">Qty must be &gt; 0.</p>
                ) : null}
              </div>
            </div>
          );
        })}

        {canOverride ? (
          <label className="flex items-start gap-2 rounded-lg border border-border bg-cream/40 p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 accent-berry"
            />
            <span>
              <span className="font-semibold text-ink">Allow override</span>
              <span className="block text-xs text-inkSoft mt-0.5">
                Close this order even if a batch is short on stock — for backfilling old
                orders against batches that are already used up. The batch may go negative.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
