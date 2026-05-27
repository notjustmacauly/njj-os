"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Check, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

type Role = "owner" | "partner" | "manager" | "staff";

export function DraftRowActions({
  batchId,
  externalId,
  staffUserId,
  role,
  currentUserId,
}: {
  batchId: string;
  externalId: string | null;
  staffUserId: string | null;
  role: Role | null;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const isOwnerPartner = role === "owner" || role === "partner";
  const isOwnDraft = staffUserId != null && staffUserId === currentUserId;
  const canEdit = isOwnerPartner || (role === "manager" && isOwnDraft);
  const canFinalize = isOwnerPartner;
  const canDiscard = canEdit;

  async function handleDiscard() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("discard_draft_batch", {
      p_batch_id: batchId,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message ?? "Could not discard draft", "error");
      return;
    }
    setConfirmOpen(false);
    toast.push(`Draft ${externalId ?? batchId} discarded`, "success");
    router.refresh();
  }

  if (!canEdit && !canFinalize && !canDiscard) {
    return <span className="text-inkSoft text-xs">—</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {canEdit ? (
        <Link
          href={`/dashboard/production/${batchId}/edit`}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-cream"
          aria-label="Edit draft"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </Link>
      ) : null}
      {canFinalize ? (
        <Link
          href={`/dashboard/production/${batchId}/edit?finalize=1`}
          className="inline-flex items-center gap-1 rounded-md border border-berryLt bg-white px-2 py-1 text-xs font-semibold text-berry hover:bg-berryBg"
          aria-label="Finalize draft"
        >
          <Check className="w-3 h-3" />
          Finalize
        </Link>
      ) : null}
      {canDiscard ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center gap-1 rounded-md border border-coral bg-white px-2 py-1 text-xs font-medium text-coral hover:bg-salmonBg"
          aria-label="Discard draft"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="Discard this draft?"
        description={`Draft ${externalId ?? batchId} will be removed. This cannot be undone.`}
        confirmLabel="Discard"
        destructive
        busy={busy}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
