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
import { formatPHP } from "@/lib/utils";
import type { TicketTypeRow } from "./types";

const CODE_PATTERN = /^[A-Z0-9-]+$/;

type EditingState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; row: TicketTypeRow };

export function TicketTypesTab({
  initial,
  canEdit,
}: {
  initial: TicketTypeRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [q, setQ] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<EditingState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = React.useState<TicketTypeRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of initial) if (r.event_category) set.add(r.event_category);
    return Array.from(set).sort();
  }, [initial]);

  const filtered = React.useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return initial.filter((r) => {
      if (!showInactive && !r.is_active) return false;
      if (!qLower) return true;
      return (
        r.name.toLowerCase().includes(qLower) ||
        r.event_category.toLowerCase().includes(qLower) ||
        r.code.toLowerCase().includes(qLower)
      );
    });
  }, [initial, q, showInactive]);

  const grouped = React.useMemo(() => {
    const m = new Map<string, TicketTypeRow[]>();
    for (const r of filtered) {
      const key = r.event_category || "—";
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return Array.from(m.entries());
  }, [filtered]);

  async function handleDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("ticket_types")
      .update({ is_active: false })
      .eq("code", pendingDelete.code);
    setDeleting(false);
    if (error) {
      toast.push(error.message, "error");
      return;
    }
    toast.push(`Disabled ${pendingDelete.code}`, "success");
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code, name, or event…"
          className="max-w-sm"
        />
        <label className="text-sm text-inkSoft flex items-center gap-1.5 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <div className="ml-auto">
          {canEdit ? (
            <Button onClick={() => setEditing({ mode: "create" })}>
              <Plus className="w-4 h-4" />
              New ticket type
            </Button>
          ) : null}
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        {grouped.length === 0 ? (
          <p className="px-5 py-8 text-sm text-inkSoft text-center">
            {initial.length === 0
              ? "No ticket types yet. Click “New ticket type” to add one."
              : "No matches."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold w-44">Code</th>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Price</th>
                <th className="px-4 py-2 font-semibold w-20">Status</th>
                <th className="px-4 py-2 font-semibold w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, rows]) => (
                <React.Fragment key={cat}>
                  <tr className="bg-cream/40 border-t border-border">
                    <td colSpan={5} className="px-4 py-1.5 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
                      {cat}
                    </td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id} className={`border-t border-border ${r.is_active ? "" : "opacity-60"}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink">{r.code}</td>
                      <td className="px-4 py-2.5 text-ink">{r.name}</td>
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
                            {r.is_active ? (
                              <button
                                type="button"
                                onClick={() => setPendingDelete(r)}
                                className="p-1.5 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral"
                                aria-label={`Disable ${r.code}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-inkSoft">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing.mode !== "closed" ? (
        <TicketTypeFormModal
          mode={editing.mode}
          row={editing.mode === "edit" ? editing.row : null}
          categories={categories}
          onClose={() => setEditing({ mode: "closed" })}
          onSaved={() => {
            setEditing({ mode: "closed" });
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Disable ${pendingDelete?.code ?? ""}?`}
        description="The ticket type will be hidden from the POS but kept for historical records. You can re-enable it later."
        confirmLabel="Disable"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function TicketTypeFormModal({
  mode,
  row,
  categories,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  row: TicketTypeRow | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = React.useState(row?.code ?? "");
  const [eventCategory, setEventCategory] = React.useState(row?.event_category ?? "");
  const [name, setName] = React.useState(row?.name ?? "");
  const [price, setPrice] = React.useState(String(Number(row?.price ?? 0)));
  const [isActive, setIsActive] = React.useState(row?.is_active ?? true);
  const [notes, setNotes] = React.useState(row?.notes ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    if (!eventCategory.trim()) return setError("Event category is required.");
    if (!name.trim()) return setError("Name is required.");
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Price must be ≥ 0.");

    if (mode === "create") {
      const codeUpper = code.trim().toUpperCase();
      if (!codeUpper) return setError("Code is required.");
      if (!CODE_PATTERN.test(codeUpper))
        return setError("Code must be uppercase letters, digits, or dashes only.");
    }

    setSubmitting(true);
    const supabase = createClient();
    if (mode === "create") {
      const { error: rpcErr } = await supabase.from("ticket_types").insert({
        code: code.trim().toUpperCase(),
        event_category: eventCategory.trim(),
        name: name.trim(),
        price: priceNum,
        is_active: isActive,
        notes: notes.trim() || null,
      });
      setSubmitting(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      toast.push("Ticket type created", "success");
      onSaved();
    } else {
      const { error: rpcErr } = await supabase
        .from("ticket_types")
        .update({
          event_category: eventCategory.trim(),
          name: name.trim(),
          price: priceNum,
          is_active: isActive,
          notes: notes.trim() || null,
        })
        .eq("code", row!.code);
      setSubmitting(false);
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      toast.push("Ticket type updated", "success");
      onSaved();
    }
  }

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title={mode === "create" ? "New ticket type" : `Edit ${row?.code ?? ""}`}
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
          <Label htmlFor="tt_code" required>
            Code
          </Label>
          <Input
            id="tt_code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={mode === "edit" || submitting}
            placeholder="TT-BADMINTON"
            className="font-mono"
          />
          {mode === "edit" ? (
            <p className="text-xs text-inkSoft">Code is fixed after creation.</p>
          ) : (
            <p className="text-xs text-inkSoft">Uppercase letters, digits, dashes only.</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="tt_event_cat" required>
            Event category
          </Label>
          <Input
            id="tt_event_cat"
            value={eventCategory}
            onChange={(e) => setEventCategory(e.target.value)}
            placeholder="Total Tuesday"
            disabled={submitting}
            list="ticket-event-categories"
          />
          <datalist id="ticket-event-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tt_name" required>
            Name
          </Label>
          <Input
            id="tt_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SMASH - Badminton"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="tt_price" required>
            Price
          </Label>
          <NumberInput
            id="tt_price"
            prefix="₱"
            min="0"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={submitting}
          />
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
          <Label htmlFor="tt_notes">Notes</Label>
          <Textarea
            id="tt_notes"
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
