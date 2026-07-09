"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type PayeeRow = {
  id: string;
  name: string;
  is_active: boolean;
  contact_number: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  notes: string | null;
};

type FormState = {
  name: string;
  contact_number: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  contact_number: "",
  bank_name: "",
  account_number: "",
  account_name: "",
  notes: "",
};

function formFrom(p: PayeeRow): FormState {
  return {
    name: p.name,
    contact_number: p.contact_number ?? "",
    bank_name: p.bank_name ?? "",
    account_number: p.account_number ?? "",
    account_name: p.account_name ?? "",
    notes: p.notes ?? "",
  };
}

export function PayeesManager({ payees }: { payees: PayeeRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // null = closed; "new" = adding; PayeeRow = editing that payee
  const [editing, setEditing] = React.useState<PayeeRow | "new" | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleting, setDeleting] = React.useState<PayeeRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditing("new");
  }
  function openEdit(p: PayeeRow) {
    setForm(formFrom(p));
    setEditing(p);
  }
  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    const name = form.name.trim();
    if (!name || saving) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("save_payee", {
      p_id: editing === "new" ? null : editing?.id ?? null,
      p_name: name,
      p_contact_number: form.contact_number.trim() || null,
      p_bank_name: form.bank_name.trim() || null,
      p_account_number: form.account_number.trim() || null,
      p_account_name: form.account_name.trim() || null,
      p_notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.push(error.message, "error");
    toast.push(editing === "new" ? "Payee added" : "Payee saved", "success");
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(p: PayeeRow) {
    setBusyId(p.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_payee_active", { p_id: p.id, p_active: !p.is_active });
    setBusyId(null);
    if (error) return toast.push(error.message, "error");
    toast.push(p.is_active ? "Payee hidden" : "Payee shown", "success");
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_payee", { p_id: deleting.id });
    setDeleteBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Payee deleted", "success");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" />
          Add payee
        </Button>
      </div>

      {payees.length > 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Contact</th>
                <th className="px-4 py-2 font-semibold">Payment details</th>
                <th className="px-4 py-2 font-semibold w-24">Status</th>
                <th className="px-4 py-2 font-semibold w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payees.map((p) => {
                const acct = [p.bank_name, p.account_number, p.account_name].filter(Boolean).join(" · ");
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-cream/30 align-top">
                    <td className={cn("px-4 py-2.5 font-medium", !p.is_active && "text-inkSoft line-through")}>
                      {p.name}
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{p.contact_number || "—"}</td>
                    <td className="px-4 py-2.5 text-inkSoft">
                      {acct ? <span className="font-mono text-xs">{acct}</span> : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.is_active ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-leafBg text-leaf text-xs font-semibold">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-cream text-inkSoft text-xs font-semibold">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          disabled={busyId === p.id}
                          className="p-2 rounded-md text-inkSoft hover:bg-cream hover:text-ink disabled:opacity-40"
                          aria-label="Edit"
                          title="Edit details"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          disabled={busyId === p.id}
                          className="p-2 rounded-md text-inkSoft hover:bg-cream hover:text-ink disabled:opacity-40"
                          aria-label={p.is_active ? "Hide" : "Show"}
                          title={p.is_active ? "Hide from pickers" : "Show in pickers"}
                        >
                          {p.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(p)}
                          disabled={busyId === p.id}
                          className="p-2 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Add / Edit */}
      <Modal
        open={editing !== null}
        onClose={saving ? () => {} : () => setEditing(null)}
        title={editing === "new" ? "Add payee" : "Edit payee"}
        description="Save contact and payment details so they're reused whenever you pay this payee."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pf-name" required>
              Name
            </Label>
            <Input
              id="pf-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Mama Sita Vegetables"
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-contact">Contact number</Label>
            <Input
              id="pf-contact"
              value={form.contact_number}
              onChange={(e) => set("contact_number", e.target.value)}
              placeholder="0917 123 4567"
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pf-bank">Bank / wallet</Label>
              <Input
                id="pf-bank"
                value={form.bank_name}
                onChange={(e) => set("bank_name", e.target.value)}
                placeholder="BDO / GCash"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-acctno">Account number</Label>
              <Input
                id="pf-acctno"
                value={form.account_number}
                onChange={(e) => set("account_number", e.target.value)}
                placeholder="0012 3456 7890"
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-acctname">Account name</Label>
            <Input
              id="pf-acctname"
              value={form.account_name}
              onChange={(e) => set("account_name", e.target.value)}
              placeholder="Juana Dela Cruz"
              disabled={saving}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-notes">Notes</Label>
            <Textarea
              id="pf-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              disabled={saving}
            />
          </div>
        </div>
      </Modal>

      {/* Delete */}
      <Modal
        open={!!deleting}
        onClose={deleteBusy ? () => {} : () => setDeleting(null)}
        title="Delete payee?"
        description="This removes the name from the pickers. Past payments and expenses keep the name they were saved with."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="dangerGhost" onClick={remove} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          Delete <span className="font-semibold">{deleting?.name}</span> from the directory?
        </p>
      </Modal>
    </div>
  );
}
