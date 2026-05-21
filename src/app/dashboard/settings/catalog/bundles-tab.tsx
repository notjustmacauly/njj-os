"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatPHP } from "@/lib/utils";
import type { BundleBreakdown, PosBundleRow } from "./types";

const CODE_PATTERN = /^[A-Z0-9_]+$/;
const FLAVORS = ["PCL", "ACG", "WPM"] as const;

type EditingState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: PosBundleRow };

export function BundlesTab({
  initial,
  canEdit,
}: {
  initial: PosBundleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [activeOnly, setActiveOnly] = React.useState(true);
  const [editing, setEditing] = React.useState<EditingState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = React.useState<PosBundleRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const filtered = React.useMemo(() => {
    return initial.filter((r) => (activeOnly ? r.is_active : true));
  }, [initial, activeOnly]);

  async function handleDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("pos_bundles")
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    toast.push(`Removed ${pendingDelete.code}`, "success");
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-inkSoft flex items-center gap-1.5 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active only
        </label>
        <div className="ml-auto">
          {canEdit ? (
            <Button onClick={() => setEditing({ mode: "create" })}>
              <Plus className="w-4 h-4" />
              New bundle
            </Button>
          ) : null}
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-sm text-inkSoft text-center">
            {initial.length === 0 ? "No bundles yet." : "No active bundles."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold w-20 text-right">Order</th>
                <th className="px-4 py-2 font-semibold w-32">Code</th>
                <th className="px-4 py-2 font-semibold w-14 text-center">Emoji</th>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold w-20 text-center">Cans</th>
                <th className="px-4 py-2 font-semibold w-28">Flavor</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Price</th>
                <th className="px-4 py-2 font-semibold w-20">Status</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={cn("border-t border-border", !r.is_active && "opacity-60")}
                >
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-inkSoft">
                    {r.sort_order}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{r.code}</td>
                  <td className="px-4 py-2.5 text-center text-lg" aria-hidden>
                    {r.emoji ?? ""}
                  </td>
                  <td className="px-4 py-2.5 text-ink">
                    <div>{r.name}</div>
                    {!r.is_flavor_pickable && r.fixed_breakdown ? (
                      <div className="text-xs text-inkSoft font-mono mt-0.5">
                        {breakdownToText(r.fixed_breakdown)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-center text-xs">
                    {r.total_cans}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.is_flavor_pickable ? (
                      <span className="text-emerald-700">Pickable</span>
                    ) : (
                      <span className="text-inkSoft">Fixed</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-right">{formatPHP(r.price)}</td>
                  <td className="px-4 py-2.5">
                    {r.is_active ? (
                      <span className="text-xs text-emerald-700">Active</span>
                    ) : (
                      <span className="text-xs text-inkSoft">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit ? (
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing({ mode: "edit", row: r })}
                          className="p-1.5 rounded-md text-inkSoft hover:bg-cream hover:text-ink"
                          aria-label={`Edit ${r.code}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(r)}
                          className="p-1.5 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral"
                          aria-label={`Remove ${r.code}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-inkSoft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing.mode !== "closed" ? (
        <BundleFormModal
          mode={editing.mode}
          row={editing.mode === "edit" ? editing.row : null}
          onClose={() => setEditing({ mode: "closed" })}
          onSaved={() => {
            setEditing({ mode: "closed" });
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Remove ${pendingDelete?.code ?? ""}?`}
        description="The bundle will be hidden from the POS. Past transactions are kept."
        confirmLabel="Remove"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function breakdownToText(b: BundleBreakdown): string {
  const parts: string[] = [];
  for (const f of FLAVORS) {
    const n = b[f] ?? 0;
    if (n > 0) parts.push(`${n}×${f}`);
  }
  return parts.join(" · ") || "—";
}

function BundleFormModal({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row: PosBundleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = React.useState(row?.code ?? "");
  const [name, setName] = React.useState(row?.name ?? "");
  const [emoji, setEmoji] = React.useState(row?.emoji ?? "");
  const [price, setPrice] = React.useState(String(Number(row?.price ?? 0)));
  const [totalCans, setTotalCans] = React.useState(String(row?.total_cans ?? 4));
  const [isPickable, setIsPickable] = React.useState(row?.is_flavor_pickable ?? true);
  const [pcl, setPcl] = React.useState(String(row?.fixed_breakdown?.PCL ?? 0));
  const [acg, setAcg] = React.useState(String(row?.fixed_breakdown?.ACG ?? 0));
  const [wpm, setWpm] = React.useState(String(row?.fixed_breakdown?.WPM ?? 0));
  const [sortOrder, setSortOrder] = React.useState(String(row?.sort_order ?? 100));
  const [isActive, setIsActive] = React.useState(row?.is_active ?? true);
  const [notes, setNotes] = React.useState(row?.notes ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totalCansNum = Number(totalCans);
  const pclNum = Number(pcl) || 0;
  const acgNum = Number(acg) || 0;
  const wpmNum = Number(wpm) || 0;
  const breakdownSum = pclNum + acgNum + wpmNum;
  const breakdownValid = !isPickable
    ? Number.isFinite(totalCansNum) && breakdownSum === totalCansNum
    : true;

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    if (!name.trim()) return setError("Name is required.");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Price must be ≥ 0.");
    if (!Number.isFinite(totalCansNum) || totalCansNum < 1)
      return setError("Total cans must be ≥ 1.");
    if (!Number.isFinite(Number(sortOrder))) return setError("Sort order must be a number.");
    if (!isPickable && breakdownSum !== totalCansNum)
      return setError(`Fixed breakdown (${breakdownSum}) must sum to total cans (${totalCansNum}).`);
    if (!isPickable && pclNum < 0) return setError("Breakdown values can't be negative.");

    if (mode === "create") {
      const codeUpper = code.trim().toUpperCase();
      if (!codeUpper) return setError("Code is required.");
      if (!CODE_PATTERN.test(codeUpper))
        return setError("Code must be uppercase letters, digits, or underscores only.");
    }

    const fixed_breakdown: BundleBreakdown | null = isPickable
      ? null
      : { PCL: pclNum, ACG: acgNum, WPM: wpmNum };

    setSubmitting(true);
    const supabase = createClient();
    if (mode === "create") {
      const { error: rpcErr } = await supabase.from("pos_bundles").insert({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        emoji: emoji.trim() || null,
        price: priceNum,
        total_cans: totalCansNum,
        is_flavor_pickable: isPickable,
        fixed_breakdown,
        sort_order: Number(sortOrder),
        is_active: isActive,
        notes: notes.trim() || null,
      });
      setSubmitting(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      toast.push("Bundle created", "success");
      onSaved();
    } else {
      const { error: rpcErr } = await supabase
        .from("pos_bundles")
        .update({
          name: name.trim(),
          emoji: emoji.trim() || null,
          price: priceNum,
          total_cans: totalCansNum,
          is_flavor_pickable: isPickable,
          fixed_breakdown,
          sort_order: Number(sortOrder),
          is_active: isActive,
          notes: notes.trim() || null,
        })
        .eq("id", row!.id);
      setSubmitting(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      toast.push("Bundle updated", "success");
      onSaved();
    }
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={mode === "create" ? "New bundle" : `Edit ${row?.code ?? ""}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !breakdownValid}>
            {submitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="b_code" required>
            Code
          </Label>
          <Input
            id="b_code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={mode === "edit" || submitting}
            placeholder="BUNDLE_4PK"
            className="font-mono"
          />
          {mode === "edit" ? (
            <p className="text-xs text-inkSoft">Code is fixed after creation.</p>
          ) : (
            <p className="text-xs text-inkSoft">Uppercase letters, digits, underscores only.</p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_80px] gap-3">
          <div className="space-y-1">
            <Label htmlFor="b_name" required>
              Name
            </Label>
            <Input
              id="b_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bundle 4-Pack"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b_emoji">Emoji</Label>
            <Input
              id="b_emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="📦"
              disabled={submitting}
              maxLength={4}
              className="text-center text-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="b_price" required>
              Price
            </Label>
            <NumberInput
              id="b_price"
              prefix="₱"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b_total_cans" required>
              Total cans
            </Label>
            <NumberInput
              id="b_total_cans"
              min="1"
              step="1"
              value={totalCans}
              onChange={(e) => setTotalCans(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b_sort_order" required>
              Sort order
            </Label>
            <NumberInput
              id="b_sort_order"
              min="0"
              step="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <fieldset className="border border-border rounded-md p-3 space-y-3">
          <legend className="px-1 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
            Flavor selection
          </legend>
          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPickable}
              onChange={(e) => setIsPickable(e.target.checked)}
              disabled={submitting}
            />
            Customer picks flavors at checkout
          </label>

          {!isPickable ? (
            <div className="space-y-2">
              <p className="text-xs text-inkSoft">
                Fixed breakdown — must sum to {totalCansNum || "?"} cans.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="b_pcl">🍍 PCL</Label>
                  <NumberInput
                    id="b_pcl"
                    min="0"
                    step="1"
                    value={pcl}
                    onChange={(e) => setPcl(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="b_acg">🥕 ACG</Label>
                  <NumberInput
                    id="b_acg"
                    min="0"
                    step="1"
                    value={acg}
                    onChange={(e) => setAcg(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="b_wpm">🍉 WPM</Label>
                  <NumberInput
                    id="b_wpm"
                    min="0"
                    step="1"
                    value={wpm}
                    onChange={(e) => setWpm(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
              <p
                className={cn(
                  "text-xs",
                  breakdownValid ? "text-emerald-700" : "text-coral",
                )}
              >
                Sum: {breakdownSum} / {totalCansNum}
              </p>
            </div>
          ) : null}
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={submitting}
          />
          Active (visible on POS)
        </label>

        <div className="space-y-1">
          <Label htmlFor="b_notes">Notes</Label>
          <Textarea
            id="b_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
          />
        </div>

        {error ? (
          <p className="text-sm text-coral bg-salmonBg/50 border border-coral/30 rounded-md px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
