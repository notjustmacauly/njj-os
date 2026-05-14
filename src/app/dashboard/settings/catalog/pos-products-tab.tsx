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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";
import { POS_PRODUCT_CATEGORIES, type PosProductRow } from "./types";

const CODE_PATTERN = /^[A-Z0-9_]+$/;

type EditingState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: PosProductRow };

export function PosProductsTab({
  initial,
  canEdit,
}: {
  initial: PosProductRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [categoryFilter, setCategoryFilter] = React.useState<string>("");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [editing, setEditing] = React.useState<EditingState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = React.useState<PosProductRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const filtered = React.useMemo(() => {
    return initial.filter((r) => {
      if (activeOnly && !r.is_active) return false;
      if (categoryFilter && r.category !== categoryFilter) return false;
      return true;
    });
  }, [initial, categoryFilter, activeOnly]);

  async function handleDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("pos_products")
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
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Category filter"
          className="max-w-xs"
        >
          <option value="">All categories</option>
          {POS_PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
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
              New POS product
            </Button>
          ) : null}
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-sm text-inkSoft text-center">
            {initial.length === 0
              ? "No POS products yet."
              : "No matches with the current filters."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold w-20 text-right">Order</th>
                <th className="px-4 py-2 font-semibold w-32">Code</th>
                <th className="px-4 py-2 font-semibold w-14 text-center">Emoji</th>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold w-24">Category</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Price</th>
                <th className="px-4 py-2 font-semibold w-20">Status</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-border ${r.is_active ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-inkSoft">
                    {r.sort_order}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{r.code}</td>
                  <td className="px-4 py-2.5 text-center text-lg" aria-hidden>
                    {r.emoji ?? ""}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-inkSoft text-xs">{r.category}</td>
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
        <PosProductFormModal
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
        description="The product will be hidden from the POS. Past transactions referencing it are kept."
        confirmLabel="Remove"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function PosProductFormModal({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row: PosProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = React.useState(row?.code ?? "");
  const [name, setName] = React.useState(row?.name ?? "");
  const [emoji, setEmoji] = React.useState(row?.emoji ?? "");
  const [price, setPrice] = React.useState(String(Number(row?.price ?? 0)));
  const [category, setCategory] = React.useState<string>(row?.category ?? "other");
  const [sortOrder, setSortOrder] = React.useState(String(row?.sort_order ?? 100));
  const [isActive, setIsActive] = React.useState(row?.is_active ?? true);
  const [notes, setNotes] = React.useState(row?.notes ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    if (!name.trim()) return setError("Name is required.");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Price must be ≥ 0.");
    const sortNum = Number(sortOrder);
    if (!Number.isFinite(sortNum)) return setError("Sort order must be a number.");

    if (mode === "create") {
      const codeUpper = code.trim().toUpperCase();
      if (!codeUpper) return setError("Code is required.");
      if (!CODE_PATTERN.test(codeUpper))
        return setError("Code must be uppercase letters, digits, or underscores only.");
    }

    setSubmitting(true);
    const supabase = createClient();
    if (mode === "create") {
      const { error: rpcErr } = await supabase.from("pos_products").insert({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        emoji: emoji.trim() || null,
        price: priceNum,
        category,
        sort_order: sortNum,
        is_active: isActive,
        notes: notes.trim() || null,
      });
      setSubmitting(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      toast.push("POS product created", "success");
      onSaved();
    } else {
      const { error: rpcErr } = await supabase
        .from("pos_products")
        .update({
          name: name.trim(),
          emoji: emoji.trim() || null,
          price: priceNum,
          category,
          sort_order: sortNum,
          is_active: isActive,
          notes: notes.trim() || null,
        })
        .eq("id", row!.id);
      setSubmitting(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      toast.push("POS product updated", "success");
      onSaved();
    }
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={mode === "create" ? "New POS product" : `Edit ${row?.code ?? ""}`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="pp_code" required>
            Code
          </Label>
          <Input
            id="pp_code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={mode === "edit" || submitting}
            placeholder="CUP_SM"
            className="font-mono"
          />
          {mode === "edit" ? (
            <p className="text-xs text-inkSoft">Code is fixed after creation.</p>
          ) : (
            <p className="text-xs text-inkSoft">
              Uppercase letters, digits, underscores only.
            </p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_80px] gap-3">
          <div className="space-y-1">
            <Label htmlFor="pp_name" required>
              Name
            </Label>
            <Input
              id="pp_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cup Large"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pp_emoji">Emoji</Label>
            <Input
              id="pp_emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🥤"
              disabled={submitting}
              maxLength={4}
              className="text-center text-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pp_price" required>
              Price
            </Label>
            <NumberInput
              id="pp_price"
              prefix="₱"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pp_category" required>
              Category
            </Label>
            <Select
              id="pp_category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
            >
              {POS_PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="pp_sort_order" required>
            Sort order
          </Label>
          <NumberInput
            id="pp_sort_order"
            min="0"
            step="1"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={submitting}
          />
          <p className="text-xs text-inkSoft">Lower numbers appear first on the POS.</p>
        </div>

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
          <Label htmlFor="pp_notes">Notes</Label>
          <Textarea
            id="pp_notes"
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
