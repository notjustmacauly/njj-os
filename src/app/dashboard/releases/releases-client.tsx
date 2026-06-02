"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

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
  batch_id: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReleasesClient({
  skus,
  batchesBySku,
}: {
  skus: SkuRef[];
  batchesBySku: Record<string, BatchOption[]>;
}) {
  const router = useRouter();
  const toast = useToast();
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
    setRows([{ tempId: crypto.randomUUID(), sku_code: firstSku, qty: 1, batch_id: "" }]);
    setIdempotencyKey(crypto.randomUUID());
  }

  function openModal() {
    resetForm();
    setOpen(true);
  }

  function addRow() {
    const used = new Set(rows.map((r) => r.sku_code));
    const nextSku = skus.find((s) => !used.has(s.code))?.code ?? firstSku;
    setRows((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), sku_code: nextSku, qty: 1, batch_id: "" },
    ]);
  }

  function updateRow(idx: number, patch: Partial<LineRow>) {
    setRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      // Changing the SKU clears a now-mismatched batch.
      if (patch.sku_code) next[idx].batch_id = "";
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
      p_items: rows.map((r) => ({
        sku_code: r.sku_code,
        qty: r.qty,
        batch_id: r.batch_id || null,
      })),
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't record release", "error");
      return;
    }
    toast.push("Release recorded", "success");
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
        title="Record a release"
        description="Deducts stock for marketing, replacements, or wastage — never counts as a sale."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !valid}>
              {busy ? "Recording…" : "Record release"}
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
            <Label htmlFor="rel-recipient">Recipient / reason</Label>
            <Input
              id="rel-recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. Influencer @juicelover, or replacement for ORD-260601-012"
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Items released
            </div>
            {rows.map((row, idx) => {
              const opts = batchesBySku[row.sku_code] ?? [];
              return (
                <div
                  key={row.tempId}
                  className="grid grid-cols-[5rem_4.5rem_1fr_2.5rem] gap-2 items-start"
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
                        {s.code}
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
                  <Select
                    value={row.batch_id}
                    onChange={(e) => updateRow(idx, { batch_id: e.target.value })}
                    aria-label="Batch"
                    className="h-9 text-xs"
                    disabled={busy}
                  >
                    <option value="">— batch (optional) —</option>
                    {opts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.external_id ?? b.id.slice(0, 8)} · {b.remaining} left
                      </option>
                    ))}
                  </Select>
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
              );
            })}
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
