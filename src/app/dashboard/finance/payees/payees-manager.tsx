"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type PayeeRow = {
  id: string;
  name: string;
  is_active: boolean;
};

export function PayeesManager({ payees }: { payees: PayeeRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [showAdd, setShowAdd] = React.useState(false);
  const [addName, setAddName] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const [renaming, setRenaming] = React.useState<PayeeRow | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [renameBusy, setRenameBusy] = React.useState(false);

  const [deleting, setDeleting] = React.useState<PayeeRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  async function add() {
    const name = addName.trim();
    if (!name || adding) return;
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_payee", { p_name: name });
    setAdding(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Payee added", "success");
    setShowAdd(false);
    setAddName("");
    router.refresh();
  }

  async function rename() {
    if (!renaming) return;
    const name = renameName.trim();
    if (!name || renameBusy) return;
    setRenameBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("rename_payee", {
      p_id: renaming.id,
      p_name: name,
    });
    setRenameBusy(false);
    if (error) return toast.push(error.message, "error");
    toast.push("Payee renamed", "success");
    setRenaming(null);
    router.refresh();
  }

  async function toggleActive(p: PayeeRow) {
    setBusyId(p.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_payee_active", {
      p_id: p.id,
      p_active: !p.is_active,
    });
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
        <Button
          onClick={() => {
            setAddName("");
            setShowAdd(true);
          }}
        >
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
                <th className="px-4 py-2 font-semibold w-24">Status</th>
                <th className="px-4 py-2 font-semibold w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payees.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-cream/30">
                  <td className={cn("px-4 py-2.5", !p.is_active && "text-inkSoft line-through")}>
                    {p.name}
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
                        onClick={() => {
                          setRenaming(p);
                          setRenameName(p.name);
                        }}
                        disabled={busyId === p.id}
                        className="p-2 rounded-md text-inkSoft hover:bg-cream hover:text-ink disabled:opacity-40"
                        aria-label="Rename"
                        title="Rename"
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
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Add */}
      <Modal
        open={showAdd}
        onClose={adding ? () => {} : () => setShowAdd(false)}
        title="Add payee"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={add} disabled={adding || !addName.trim()}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Label htmlFor="payee-add" required>
            Name
          </Label>
          <Input
            id="payee-add"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Mama Sita Vegetables"
            disabled={adding}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
        </div>
      </Modal>

      {/* Rename */}
      <Modal
        open={!!renaming}
        onClose={renameBusy ? () => {} : () => setRenaming(null)}
        title="Rename payee"
        description="Renaming into a name that already exists will merge the two."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)} disabled={renameBusy}>
              Cancel
            </Button>
            <Button onClick={rename} disabled={renameBusy || !renameName.trim()}>
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Label htmlFor="payee-rename" required>
            Name
          </Label>
          <Input
            id="payee-rename"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            disabled={renameBusy}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
            }}
          />
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
