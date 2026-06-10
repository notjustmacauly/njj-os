"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { usePayees } from "../finance/use-payees";

export type SkuRef = {
  code: string;
  name: string;
  retail_price: number | string | null;
};

export type BatchOption = {
  id: string;
  external_id: string | null;
  remaining: number;
  batch_date: string;
};

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "marketing", label: "Marketing give-away" },
  { value: "replacement", label: "Customer replacement" },
  { value: "wastage", label: "Wastage / spoilage" },
  { value: "damage", label: "Damage / breakage" },
  { value: "comps", label: "Comp (free sample)" },
  { value: "other", label: "Other" },
];

type LineRow = {
  tempId: string;
  sku_code: string;
  qty: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Create — captures type/recipient/items only. No batch here: the release is
// saved as PENDING and deducts NO stock until delivery is completed.
// ---------------------------------------------------------------------------
export function ReleasesClient({ skus }: { skus: SkuRef[] }) {
  const router = useRouter();
  const toast = useToast();
  const { options: payeeOptions, remember: rememberPayee } = usePayees();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [type, setType] = React.useState("marketing");
  const [recipient, setRecipient] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  const [rows, setRows] = React.useState<LineRow[]>([]);
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());

  const firstSku = skus[0]?.code ?? "PCL";

  function resetForm() {
    setType("marketing");
    setRecipient("");
    setDate(todayIso());
    setNotes("");
    setRows([{ tempId: crypto.randomUUID(), sku_code: firstSku, qty: 1 }]);
    setIdempotencyKey(crypto.randomUUID());
  }

  function openModal() {
    resetForm();
    setOpen(true);
  }

  function addRow() {
    const used = new Set(rows.map((r) => r.sku_code));
    const nextSku = skus.find((s) => !used.has(s.code))?.code ?? firstSku;
    setRows((prev) => [...prev, { tempId: crypto.randomUUID(), sku_code: nextSku, qty: 1 }]);
  }

  function updateRow(idx: number, patch: Partial<LineRow>) {
    setRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const duplicateSku = (() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.sku_code)) return true;
      seen.add(r.sku_code);
    }
    return false;
  })();
  const nonPositive = rows.some((r) => !Number.isFinite(r.qty) || r.qty <= 0);
  const valid = rows.length > 0 && !duplicateSku && !nonPositive;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_deduction", {
      p_idempotency_key: idempotencyKey,
      p_type: type,
      p_recipient: recipient.trim() || null,
      p_deduction_date: date,
      p_notes: notes.trim() || null,
      p_items: rows.map((r) => ({ sku_code: r.sku_code, qty: r.qty })),
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't record release", "error");
      return;
    }
    void rememberPayee(recipient);
    toast.push("Release created — complete delivery to deduct stock", "success");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={openModal}>
        <Plus className="w-4 h-4" />
        New release
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Create a release"
        description="Records what's going out. No stock moves until you complete delivery and assign a batch."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !valid}>
              {busy ? "Saving…" : "Create release"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="rel-type" required>
                Type
              </Label>
              <Select
                id="rel-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={busy}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rel-date" required>
                Date
              </Label>
              <DateInput
                id="rel-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Recipient / reason</Label>
            <Combobox
              ariaLabel="Recipient"
              value={recipient}
              onChange={setRecipient}
              options={payeeOptions}
              creatable
              placeholder="Pick a recipient or type a new one"
              emptyMessage="No saved payees yet — just type the name"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Items released
            </div>
            {rows.map((row, idx) => (
              <div
                key={row.tempId}
                className="grid grid-cols-[1fr_5rem_2.5rem] gap-2 items-start"
              >
                <Select
                  value={row.sku_code}
                  onChange={(e) => updateRow(idx, { sku_code: e.target.value })}
                  aria-label="SKU"
                  className="h-9 text-xs"
                  disabled={busy}
                >
                  {skus.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
                <NumberInput
                  min="1"
                  step="1"
                  value={row.qty || ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    updateRow(idx, { qty: Number.isFinite(n) && n >= 0 ? n : 0 });
                  }}
                  aria-label="Qty"
                  className="h-9 text-right"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={busy || rows.length <= 1}
                  className="p-2 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {rows.length < skus.length ? (
              <Button type="button" size="sm" variant="berryGhost" onClick={addRow} disabled={busy}>
                <Plus className="w-4 h-4" />
                Add item
              </Button>
            ) : null}
            {duplicateSku ? (
              <p className="text-xs text-coral">Each SKU can only appear once per release.</p>
            ) : null}
            {nonPositive ? <p className="text-xs text-coral">Qty must be &gt; 0.</p> : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rel-notes">Notes (optional)</Label>
            <Textarea
              id="rel-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={busy}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Complete delivery — assign one batch per line; this is when stock is
// actually deducted. owner/partner can override to close against an old/
// depleted batch (historical clean-up).
// ---------------------------------------------------------------------------
export function DeliverRelease({
  deductionId,
  externalId,
  items,
  batchesBySku,
  canOverride,
}: {
  deductionId: string;
  externalId: string | null;
  items: Array<{ id: string; sku_code: string; qty: number }>;
  batchesBySku: Record<string, BatchOption[]>;
  canOverride: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [override, setOverride] = React.useState(false);
  // item_id -> batch_id
  const [picks, setPicks] = React.useState<Record<string, string>>({});

  function openModal() {
    setPicks({});
    setOverride(false);
    setOpen(true);
  }

  const allPicked = items.length > 0 && items.every((it) => picks[it.id]);

  async function submit() {
    if (!allPicked || busy) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("deliver_deduction", {
      p_deduction_id: deductionId,
      p_allocations: items.map((it) => ({ item_id: it.id, batch_id: picks[it.id] })),
      p_allow_override: canOverride && override,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't complete delivery", "error");
      return;
    }
    toast.push("Delivery completed — stock deducted", "success");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="berryGhost" onClick={openModal}>
        <Truck className="w-4 h-4" />
        Complete delivery
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={`Complete delivery${externalId ? ` · ${externalId}` : ""}`}
        description="Pick which batch each line is drawn from. This deducts stock."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !allPicked}>
              {busy ? "Completing…" : "Complete delivery"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {items.map((it) => {
            const opts = batchesBySku[it.sku_code] ?? [];
            return (
              <div key={it.id} className="grid grid-cols-[6rem_1fr] gap-2 items-center">
                <div className="text-sm font-semibold">
                  {it.qty}× {it.sku_code}
                </div>
                <Select
                  value={picks[it.id] ?? ""}
                  onChange={(e) =>
                    setPicks((prev) => ({ ...prev, [it.id]: e.target.value }))
                  }
                  aria-label={`Batch for ${it.sku_code}`}
                  className="h-9 text-xs"
                  disabled={busy}
                >
                  <option value="">— pick a batch —</option>
                  {opts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.external_id ?? b.id.slice(0, 8)} · {b.remaining} left
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}

          {canOverride ? (
            <label className="flex items-start gap-2 text-sm bg-cream/40 border border-border rounded-md px-3 py-2">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                disabled={busy}
                className="mt-0.5"
              />
              <span>
                Allow drawing from a depleted/old batch (override the stock check). Use only
                to close out historical releases.
              </span>
            </label>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
