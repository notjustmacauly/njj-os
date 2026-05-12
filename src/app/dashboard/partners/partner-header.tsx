"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, tierTone, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";

export function PartnerHeader({
  partnerId,
  externalId,
  name,
  tierCode,
  deliveryFee,
  isActive,
  canManage,
}: {
  partnerId: string;
  externalId: string | null;
  name: string;
  tierCode: string;
  deliveryFee: number | string | null;
  isActive: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  async function handleDelete() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("partners")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", partnerId);
    setBusy(false);
    setConfirmOpen(false);
    if (error) {
      toast.push(error.message || "Couldn't delete partner", "error");
      return;
    }
    toast.push("Partner deleted", "success");
    router.push("/dashboard/partners");
    router.refresh();
  }

  return (
    <>
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                {externalId ?? "—"}
              </span>
              <span className="text-inkSoft">·</span>
              <h2 className="font-serif font-bold text-2xl text-ink truncate">
                {name}
              </h2>
              <StatusBadge status={isActive ? "Active" : "Inactive"} />
            </div>
            <div className="mt-2 text-sm text-inkSoft flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                Tier
                <Badge tone={tierTone(tierCode)}>{tierCode}</Badge>
              </span>
              <span>·</span>
              <span>{formatPHP(deliveryFee)} delivery</span>
            </div>
          </div>

          {canManage ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className="p-1.5 rounded-md hover:bg-cream text-inkSoft hover:text-ink"
                aria-label="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 mt-1 w-44 bg-white border border-border rounded-md shadow-card py-1 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-coral hover:bg-salmonBg"
                  >
                    <Trash2 className="w-4 h-4" />
                    Soft-delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-t border-border bg-cream/50 px-5 py-3 flex gap-2">
          <Link
            href={`/dashboard/orders?partner=${partnerId}`}
            className={buttonClasses({ variant: "berryGhost", size: "sm" })}
          >
            View orders
          </Link>
          <Link
            href={`/dashboard/finance?partner=${partnerId}`}
            className={buttonClasses({ variant: "berryGhost", size: "sm" })}
          >
            View bills
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this partner?"
        description={`"${name}" will be soft-deleted and hidden from lists. This can be reversed later by an admin.`}
        confirmLabel="Delete partner"
        destructive
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
