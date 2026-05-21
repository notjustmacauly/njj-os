"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Lock, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatPHP } from "@/lib/utils";

export type LotRow = {
  id: string;
  external_id: string | null;
  received_date: string;
  vendor: string | null;
  purchase_qty: number | string;
  purchase_unit: string;
  converted_qty: number | string;
  converted_unit: string;
  total_cost: number | string;
  cost_per_unit: number | string;
  qty_remaining: number | string;
  notes: string | null;
  received_by_name: string | null;
  ledger_entry_id: string | null;
  account_code: string;
  /** How many batch_inputs reference this lot. Voiding is only allowed
   *  when this is zero (RPC checks too — UI just matches). */
  consumed_count: number;
};

export function LotsView({
  unit,
  activeLots,
  depletedLots,
  canEdit,
}: {
  unit: string;
  activeLots: LotRow[];
  depletedLots: LotRow[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = React.useState<LotRow | null>(null);
  return (
    <>
      <section className="space-y-2">
        <h2 className="font-serif font-bold text-lg text-ink">
          Active lots ({activeLots.length})
        </h2>
        {activeLots.length === 0 ? (
          <p className="text-sm text-inkSoft">No active lots. Log a receipt to add stock.</p>
        ) : (
          <LotsTable rows={activeLots} unit={unit} depleted={false} onSelect={setSelected} />
        )}
      </section>

      {depletedLots.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-serif font-bold text-lg text-ink">
            Depleted lots ({depletedLots.length})
          </h2>
          <LotsTable rows={depletedLots} unit={unit} depleted onSelect={setSelected} />
        </section>
      ) : null}

      {selected ? (
        <LotDetailModal
          lot={selected}
          unit={unit}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function LotsTable({
  rows,
  unit,
  depleted,
  onSelect,
}: {
  rows: LotRow[];
  unit: string;
  depleted: boolean;
  onSelect: (lot: LotRow) => void;
}) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cream text-inkSoft">
          <tr className="text-left">
            <th className="px-4 py-2 font-semibold w-36">Lot</th>
            <th className="px-4 py-2 font-semibold w-28">Received</th>
            <th className="px-4 py-2 font-semibold">Vendor</th>
            <th className="px-4 py-2 font-semibold w-32">Purchase</th>
            <th className="px-4 py-2 font-semibold w-32 text-right">Remaining</th>
            <th className="px-4 py-2 font-semibold w-32 text-right">Total cost</th>
            <th className="px-4 py-2 font-semibold w-28 text-right">Per unit</th>
            <th className="px-4 py-2 font-semibold w-16 text-center">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const qtyRemaining = Number(r.qty_remaining);
            const convertedQty = Number(r.converted_qty);
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r)}
                className={cn(
                  "border-t border-border cursor-pointer hover:bg-cream/30 transition",
                  depleted && "opacity-60",
                )}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-ink">
                  {r.external_id ?? r.id.slice(0, 8)}
                </td>
                <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                  {formatDate(r.received_date)}
                </td>
                <td className="px-4 py-2.5 text-sm text-ink truncate">
                  {r.vendor || <span className="text-inkSoft">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-inkSoft font-mono">
                  {Number(r.purchase_qty)} {r.purchase_unit}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {depleted ? (
                    <span className="text-inkSoft italic">depleted</span>
                  ) : (
                    <span>
                      {qtyRemaining.toFixed(1)} / {convertedQty.toFixed(1)} {unit}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {formatPHP(r.total_cost)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-berry">
                  {formatPHP(r.cost_per_unit)}
                </td>
                <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                  {r.ledger_entry_id ? (
                    <Link
                      href={`/dashboard/finance/accounts/${encodeURIComponent(r.account_code)}`}
                      className="inline-flex text-inkSoft hover:text-berry"
                      title="View linked ledger entry"
                      aria-label="Ledger entry"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span className="text-inkSoft text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LotDetailModal({
  lot,
  unit,
  canEdit,
  onClose,
}: {
  lot: LotRow;
  unit: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [vendor, setVendor] = React.useState(lot.vendor ?? "");
  const [receivedDate, setReceivedDate] = React.useState(lot.received_date);
  const [notes, setNotes] = React.useState(lot.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const [showVoid, setShowVoid] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");
  const [voiding, setVoiding] = React.useState(false);
  const [voidError, setVoidError] = React.useState<string | null>(null);

  const dirty =
    vendor !== (lot.vendor ?? "") ||
    receivedDate !== lot.received_date ||
    notes !== (lot.notes ?? "");
  const canVoid = canEdit && lot.consumed_count === 0;

  async function handleSave() {
    if (!canEdit || !dirty || saving) return;
    setSaving(true);
    setEditError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("edit_ingredient_lot_cosmetic", {
      p_lot_id: lot.id,
      p_vendor: vendor !== (lot.vendor ?? "") ? vendor.trim() || null : null,
      p_received_date: receivedDate !== lot.received_date ? receivedDate : null,
      p_notes: notes !== (lot.notes ?? "") ? notes.trim() || null : null,
    });
    setSaving(false);
    if (error) {
      setEditError(error.message);
      return;
    }
    toast.push("Lot updated", "success");
    onClose();
    router.refresh();
  }

  async function handleVoid() {
    if (!canVoid || voiding) return;
    setVoiding(true);
    setVoidError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("void_ingredient_lot", {
      p_lot_id: lot.id,
      p_reason: voidReason.trim() || null,
    });
    setVoiding(false);
    if (error) {
      setVoidError(error.message);
      return;
    }
    toast.push("Lot voided · ledger reversed", "success");
    setShowVoid(false);
    onClose();
    router.refresh();
  }

  return (
    <>
      <Modal
        open={!showVoid}
        onClose={saving ? () => {} : onClose}
        title={lot.external_id ?? "Lot"}
        description={`Received ${formatDate(lot.received_date)} · ${Number(lot.qty_remaining).toFixed(1)} / ${Number(lot.converted_qty).toFixed(1)} ${unit} remaining`}
        size="md"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {canVoid ? (
              <Button variant="dangerGhost" onClick={() => setShowVoid(true)}>
                Void this lot
              </Button>
            ) : canEdit && lot.consumed_count > 0 ? (
              <span className="text-xs text-inkSoft inline-flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Consumed by {lot.consumed_count} batch{lot.consumed_count === 1 ? "" : "es"} —
                use a ledger correction.
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Close
              </Button>
              {canEdit ? (
                <Button onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? "Saving…" : "Save edits"}
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          {/* Editable: vendor / received_date / notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lot_received_date" className="flex items-center gap-1">
                Received date
                {canEdit ? <Pencil className="w-3 h-3 text-inkSoft" /> : null}
              </Label>
              <DateInput
                id="lot_received_date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                disabled={!canEdit || saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lot_vendor" className="flex items-center gap-1">
                Vendor
                {canEdit ? <Pencil className="w-3 h-3 text-inkSoft" /> : null}
              </Label>
              <Input
                id="lot_vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Mama Sita Produce"
                disabled={!canEdit || saving}
              />
            </div>
          </div>

          {/* Locked: purchase qty/unit, converted qty/unit, total cost, account.
              Render as read-only with a tooltip on the lock icon. */}
          <fieldset className="border border-border rounded-md p-3 space-y-2">
            <legend className="px-1 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft inline-flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Locked — material fields
            </legend>
            <p className="text-[11px] text-inkSoft">
              Cost, quantity, ingredient, and account can&rsquo;t be edited. Mistakes
              there should be corrected by voiding this lot and logging a new one with
              the right values.
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <Row dt="Purchase" dd={`${Number(lot.purchase_qty)} ${lot.purchase_unit}`} />
              <Row
                dt="Converted"
                dd={`${Number(lot.converted_qty)} ${lot.converted_unit}`}
              />
              <Row dt="Total cost" dd={formatPHP(lot.total_cost)} />
              <Row dt="Per unit" dd={`${formatPHP(lot.cost_per_unit)} / ${unit}`} />
              <Row dt="Paid from" dd={lot.account_code} />
              <Row
                dt="Received by"
                dd={lot.received_by_name ?? <span className="text-inkSoft">—</span>}
              />
            </dl>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="lot_notes" className="flex items-center gap-1">
              Notes
              {canEdit ? <Pencil className="w-3 h-3 text-inkSoft" /> : null}
            </Label>
            <Textarea
              id="lot_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={!canEdit || saving}
            />
          </div>

          {editError ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
              {editError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={showVoid}
        onClose={voiding ? () => {} : () => setShowVoid(false)}
        title={`Void ${lot.external_id ?? "lot"}?`}
        description="Reverses the original purchase ledger entry (the source account recovers the lot's total cost). Cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowVoid(false)} disabled={voiding}>
              Back
            </Button>
            <Button variant="dangerGhost" onClick={handleVoid} disabled={voiding}>
              {voiding ? "Voiding…" : "Confirm void"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lot_void_reason">Reason (optional)</Label>
            <Textarea
              id="lot_void_reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={2}
              disabled={voiding}
              placeholder="wrong ingredient, double-counted receipt, …"
            />
          </div>
          {voidError ? (
            <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
              {voidError}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function Row({ dt, dd }: { dt: string; dd: React.ReactNode }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft self-center">
        {dt}
      </dt>
      <dd className="text-ink font-mono">{dd}</dd>
    </>
  );
}
