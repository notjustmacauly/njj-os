"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import {
  REVENUE_CATEGORY_LABELS,
  type RevenueCategory,
} from "./log-revenue-modal";
import type { Role } from "@/lib/roles";

export type StandaloneRevenueRow = {
  id: string;
  external_id: string | null;
  revenue_date: string;
  category: RevenueCategory;
  description: string;
  amount: number;
  account_code: string;
  notes: string | null;
  logged_by_name: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

type FilterKey = RevenueCategory | "voided" | "all";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "catering_contract", label: "Catering / contracts" },
  { key: "event", label: "Events" },
  { key: "sponsorship", label: "Sponsorship" },
  { key: "rent", label: "Rent" },
  { key: "other", label: "Other" },
  { key: "voided", label: "Voided" },
];

export function StandaloneRevenueEntries({
  rows,
  accountNameByCode,
  role,
}: {
  rows: StandaloneRevenueRow[];
  accountNameByCode: Record<string, string>;
  role: Role;
}) {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [voidTarget, setVoidTarget] =
    React.useState<StandaloneRevenueRow | null>(null);

  const canVoid = role === "owner";

  const filtered = rows.filter((r) => {
    if (filter === "all") return r.voided_at == null;
    if (filter === "voided") return r.voided_at != null;
    return r.voided_at == null && r.category === filter;
  });

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif font-bold text-xl text-ink">
            Standalone revenue entries
          </h2>
          <p className="text-xs text-inkSoft mt-0.5">
            Manually logged inflows — contracts, events, sponsorship, rent, misc.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1 text-xs rounded-full border transition",
                on
                  ? "bg-berry text-white border-berry"
                  : "bg-white text-inkSoft border-border hover:bg-cream",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-28">Date</th>
              <th className="px-4 py-2 font-semibold w-40">Category</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold w-40">Account</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
              {canVoid ? (
                <th className="px-4 py-2 font-semibold w-24 text-right">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td
                  colSpan={canVoid ? 6 : 5}
                  className="px-4 py-8 text-center text-sm text-inkSoft"
                >
                  {filter === "voided"
                    ? "No voided entries."
                    : "No entries yet. Log one with the button above."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const voided = r.voided_at != null;
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t border-border",
                      voided
                        ? "bg-cream/30 text-inkSoft"
                        : "hover:bg-cream/30",
                    )}
                  >
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {formatDate(r.revenue_date)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {REVENUE_CATEGORY_LABELS[r.category]}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className={cn(voided && "line-through")}>
                        {r.description}
                      </div>
                      {voided ? (
                        <div className="text-xs mt-0.5">
                          Voided: {r.void_reason ?? "no reason given"}
                        </div>
                      ) : r.logged_by_name ? (
                        <div className="text-xs text-inkSoft mt-0.5">
                          logged by {r.logged_by_name}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {accountNameByCode[r.account_code] ?? r.account_code}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono font-semibold tabular-nums",
                        voided ? "text-inkSoft line-through" : "text-berry",
                      )}
                    >
                      {formatPHP(r.amount)}
                    </td>
                    {canVoid ? (
                      <td className="px-4 py-2.5 text-right">
                        {voided ? (
                          <span className="text-xs text-inkSoft">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setVoidTarget(r)}
                            className="inline-flex items-center rounded-md border border-coral bg-white px-2 py-1 text-xs font-medium text-coral hover:bg-salmonBg"
                          >
                            Void
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot className="bg-cream/40 border-t border-border">
              <tr>
                <td
                  colSpan={canVoid ? 5 : 4}
                  className="px-4 py-2.5 text-xs text-inkSoft text-right font-semibold"
                >
                  Total ({filtered.length} {filtered.length === 1 ? "entry" : "entries"})
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-mono text-berry font-semibold tabular-nums",
                    canVoid ? "" : "",
                  )}
                  colSpan={canVoid ? 1 : 1}
                >
                  {formatPHP(total)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <VoidRevenueModal
        target={voidTarget}
        onClose={() => setVoidTarget(null)}
      />
    </section>
  );
}

function VoidRevenueModal({
  target,
  onClose,
}: {
  target: StandaloneRevenueRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (target) setReason("");
  }, [target]);

  async function submit() {
    if (!target) return;
    if (!reason.trim()) {
      toast.push("Reason is required", "error");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("void_revenue_entry", {
      p_id: target.id,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't void entry", "error");
      return;
    }
    toast.push("Revenue entry voided — counter-entry posted to ledger.", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={target != null}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Void revenue entry"
      description={
        target
          ? `${target.description} · ${formatPHP(target.amount)}`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="dangerGhost"
            size="sm"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Voiding…" : "Void entry"}
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        <Label htmlFor="void_reason" required>
          Reason
        </Label>
        <Textarea
          id="void_reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being voided?"
          disabled={busy}
        />
        <p className="text-xs text-inkSoft">
          Posts a counter-entry to {target?.account_code ?? "the same account"}{" "}
          so the ledger balances. Row stays in the list for audit.
        </p>
      </div>
    </Modal>
  );
}
