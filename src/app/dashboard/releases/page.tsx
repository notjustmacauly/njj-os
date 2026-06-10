import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPHP } from "@/lib/utils";
import { hasRole, OWNER_PARTNER, OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { ReleasesClient, DeliverRelease, type BatchOption, type SkuRef } from "./releases-client";

// "Releases" — non-sale stock outflows (marketing, replacements, wastage).
// They deduct inventory via deduction_items but never count as a sale.

const TYPE_LABEL: Record<string, string> = {
  marketing: "Marketing",
  replacement: "Replacement",
  wastage: "Wastage",
  damage: "Damage",
  comps: "Comp",
  other: "Other",
};

type DeductionItem = {
  id: string;
  sku_code: string;
  qty: number;
  batch: { external_id: string | null } | { external_id: string | null }[] | null;
};

type DeductionRow = {
  id: string;
  external_id: string | null;
  deduction_date: string;
  type: string;
  recipient: string | null;
  status: string;
  total_qty: number;
  est_value: number | string;
  notes: string | null;
  deduction_items: DeductionItem[];
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ReleasesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = (roleRow?.role as Role | null) ?? null;
  if (!hasRole(role, OWNER_PARTNER_MANAGER)) redirect("/dashboard");

  const [{ data: rowsData }, { data: skusData }, { data: invData }] = await Promise.all([
    supabase
      .from("deductions")
      .select(
        "id, external_id, deduction_date, type, recipient, status, total_qty, est_value, notes, deduction_items(id, sku_code, qty, batch:batches!deduction_items_batch_id_fkey(external_id))",
      )
      .is("deleted_at", null)
      .order("deduction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("skus")
      .select("code, name, retail_price")
      .eq("is_active", true)
      .in("code", ["PCL", "ACG", "WPM"])
      .order("code"),
    supabase
      .from("inventory_summary")
      .select("batch_id, batch_external_id, sku_code, remaining, batch_date")
      .in("sku_code", ["PCL", "ACG", "WPM"])
      .order("batch_date", { ascending: false }),
  ]);

  const rows = (rowsData ?? []) as DeductionRow[];
  const skus = (skusData ?? []) as SkuRef[];
  const canOverride = hasRole(role, OWNER_PARTNER);

  const batchesBySku: Record<string, BatchOption[]> = { PCL: [], ACG: [], WPM: [] };
  for (const r of (invData ?? []) as Array<{
    batch_id: string;
    batch_external_id: string | null;
    sku_code: string;
    remaining: number;
    batch_date: string;
  }>) {
    if (!batchesBySku[r.sku_code]) batchesBySku[r.sku_code] = [];
    batchesBySku[r.sku_code].push({
      id: r.batch_id,
      external_id: r.batch_external_id,
      remaining: r.remaining,
      batch_date: r.batch_date,
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
            <Gift className="w-7 h-7 text-berry" />
            Releases
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Stock given out for marketing, replacements, or written off — deducts inventory,
            never counts as a sale.
          </p>
        </div>
        <ReleasesClient skus={skus} />
      </header>

      {rows.length === 0 ? (
        <EmptyState
          emoji="🎁"
          title="No releases yet"
          description="Record marketing samples, customer replacements, or wastage to keep inventory accurate."
        />
      ) : (
        <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold">Ref</th>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Recipient</th>
                <th className="px-4 py-2 font-semibold">Items</th>
                <th className="px-4 py-2 font-semibold w-20 text-right">Cans</th>
                <th className="px-4 py-2 font-semibold w-28 text-right">Est. value</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold w-32"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const items = (r.deduction_items ?? [])
                  .map((it) => {
                    const b = Array.isArray(it.batch) ? it.batch[0] : it.batch;
                    return `${it.qty}× ${it.sku_code}${b?.external_id ? ` (${b.external_id})` : ""}`;
                  })
                  .join(", ");
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-inkSoft">
                      {r.external_id ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.deduction_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-berryBg text-berry text-xs font-semibold">
                        {TYPE_LABEL[r.type] ?? r.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{r.recipient || "—"}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{items || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.total_qty}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">
                      {formatPHP(Number(r.est_value ?? 0))}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === "delivered" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-leafBg text-leaf text-xs font-semibold">
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-amberBg text-amber text-xs font-semibold">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.status !== "delivered" ? (
                        <DeliverRelease
                          deductionId={r.id}
                          externalId={r.external_id}
                          items={(r.deduction_items ?? []).map((it) => ({
                            id: it.id,
                            sku_code: it.sku_code,
                            qty: it.qty,
                          }))}
                          batchesBySku={batchesBySku}
                          canOverride={canOverride}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-inkSoft px-1">
        Est. value uses each SKU&apos;s retail price — a rough marketing cost / loss figure, not
        a recorded expense.
      </p>
    </div>
  );
}
