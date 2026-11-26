import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPHP } from "@/lib/utils";
import {
  hasRole,
  OWNER_PARTNER,
  OWNER_PARTNER_MANAGER,
  type Role,
} from "@/lib/roles";
import { PagerPublisher } from "@/components/pager-publisher";

type InventoryRow = {
  code: string;
  name: string;
  unit: string;
  ingredient_type: string;
  qty_on_hand: number | string;
  active_lots: number;
  last_received_date: string | null;
  avg_cost_per_unit: number | string | null;
};

function lowStockThreshold(type: string): number {
  // Different scales per type: additives are used in tiny amounts, produce by
  // the kg, cups/cans by the hundreds.
  if (type === "packaging") return 50;
  if (type === "additive") return 1;
  return 5;
}

function lastReceivedLabel(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(`${iso}T00:00:00+08:00`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date());
  const today = new Date(`${todayStr}T00:00:00+08:00`);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatQty(qty: number, unit: string): string {
  const decimals = unit === "unit" ? 0 : 1;
  return `${qty.toFixed(decimals)} ${unit}`;
}

// --- Grouping -------------------------------------------------------------
// Two top-level sections, so juice ingredients never sit in the same list as
// the bottled water / cups / lids sold and served at markets.
//   Ingredients & production: produce, additives, water, cans, produced stock.
//   Resale & packaging:       bottled water, cups, lids.

type Bucket = { category: string; order: number; rows: InventoryRow[] };

function classify(r: InventoryRow): { section: "ingredients" | "resale"; category: string; order: number } {
  const code = r.code.toUpperCase();
  const type = r.ingredient_type;

  // Resale & packaging = bottled water + cups + lids.
  if (type === "resale") return { section: "resale", category: "Bottled water", order: 1 };
  if (code.startsWith("PKG_CUP")) return { section: "resale", category: "Cups", order: 2 };
  if (code === "PKG_LID" || code.startsWith("PKG_LID")) return { section: "resale", category: "Lids", order: 3 };

  // Everything else = ingredients & production.
  if (type === "produce") return { section: "ingredients", category: "Produce", order: 1 };
  if (type === "additive") return { section: "ingredients", category: "Additives", order: 2 };
  if (type === "water") return { section: "ingredients", category: "Water", order: 3 };
  if (code.startsWith("CAN_")) return { section: "ingredients", category: "Cans", order: 4 };
  if (type === "other") return { section: "ingredients", category: "Produced stock", order: 5 };
  return { section: "ingredients", category: "Other", order: 6 };
}

function bucketize(rows: InventoryRow[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const { category, order } = classify(r);
    const b = map.get(category) ?? { category, order, rows: [] };
    b.rows.push(r);
    map.set(category, b);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

function sectionValue(rows: InventoryRow[]): number {
  return rows.reduce((sum, r) => {
    const qty = Number(r.qty_on_hand ?? 0);
    const cost = r.avg_cost_per_unit != null ? Number(r.avg_cost_per_unit) : 0;
    return sum + (qty > 0 ? qty * cost : 0);
  }, 0);
}

function InventorySection({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: InventoryRow[];
}) {
  if (rows.length === 0) return null;
  const buckets = bucketize(rows);
  const value = sectionValue(rows);

  return (
    <section className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-serif font-bold text-xl text-ink">{title}</h2>
          <p className="text-xs text-inkSoft mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="font-mono font-semibold text-ink tabular-nums">{formatPHP(value)}</div>
          <div className="text-[11px] uppercase tracking-smallcaps text-inkSoft">
            {rows.length} item{rows.length === 1 ? "" : "s"} on hand
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream/70 text-inkSoft">
            <tr className="text-left">
              <th className="px-5 py-2 font-semibold">Item</th>
              <th className="px-4 py-2 font-semibold w-36 text-right">On hand</th>
              <th className="px-4 py-2 font-semibold w-16 text-right">Lots</th>
              <th className="px-4 py-2 font-semibold w-32 text-right">Avg cost</th>
              <th className="px-4 py-2 font-semibold w-32">Last received</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <React.Fragment key={bucket.category}>
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 pt-4 pb-1 text-[11px] uppercase tracking-smallcaps font-semibold text-berry"
                  >
                    {bucket.category}
                  </td>
                </tr>
                {bucket.rows.map((r) => {
                  const qty = Number(r.qty_on_hand ?? 0);
                  const negative = qty < 0;
                  const low = qty > 0 && qty < lowStockThreshold(r.ingredient_type);
                  const empty = qty === 0;
                  const avgCost = r.avg_cost_per_unit != null ? Number(r.avg_cost_per_unit) : null;
                  return (
                    <tr key={r.code} className="border-t border-border/70 hover:bg-cream/30 transition-colors">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/dashboard/inventory/${encodeURIComponent(r.code)}`}
                          className="group inline-flex items-baseline gap-2"
                        >
                          <span className="font-semibold text-ink group-hover:text-berry transition-colors">
                            {r.name}
                          </span>
                          <span className="text-[11px] text-inkSoft font-mono">{r.code}</span>
                        </Link>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                          negative || low ? "text-coral font-semibold" : empty ? "text-inkSoft" : "text-ink"
                        }`}
                      >
                        {formatQty(qty, r.unit)}
                        {negative ? (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-coral/10 px-1.5 py-0.5 text-[10px] uppercase tracking-smallcaps text-coral">
                            negative
                          </span>
                        ) : low ? (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-coral/10 px-1.5 py-0.5 text-[10px] uppercase tracking-smallcaps text-coral">
                            low
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-inkSoft tabular-nums">
                        {r.active_lots > 0 ? r.active_lots : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {avgCost != null ? (
                          <span>
                            {formatPHP(avgCost)}
                            <span className="text-inkSoft text-xs ml-1">/{r.unit}</span>
                          </span>
                        ) : (
                          <span className="text-inkSoft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                        {lastReceivedLabel(r.last_received_date)}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function InventoryPage() {
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

  const canReceive = hasRole(role, OWNER_PARTNER);

  const { data: rowsData } = await supabase
    .from("inventory_on_hand")
    .select(
      "code, name, unit, ingredient_type, qty_on_hand, active_lots, last_received_date, avg_cost_per_unit",
    )
    .order("ingredient_type")
    .order("name");

  const rows = (rowsData ?? []) as InventoryRow[];
  const ingredientRows = rows.filter((r) => classify(r).section === "ingredients");
  const resaleRows = rows.filter((r) => classify(r).section === "resale");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">Inventory</h1>
          <p className="text-sm text-inkSoft mt-1">
            Live on-hand stock. Each receipt is its own lot; batches and sales deduct FIFO.
          </p>
        </div>
        {canReceive ? (
          <Link href="/dashboard/inventory/receive" className={buttonClasses()}>
            <Plus className="w-4 h-4" />
            Log received
          </Link>
        ) : null}
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No inventory yet"
          description="Add ingredients via Production, or receive resale stock, to start tracking lots."
        />
      ) : (
        <>
          <PagerPublisher entity="inventory" segments={rows.map((r) => r.code)} />
          <InventorySection
            title="Ingredients & production"
            subtitle="Produce, additives, water, cans and produced stock that go into the juice."
            rows={ingredientRows}
          />
          <InventorySection
            title="Resale & packaging"
            subtitle="Bottled water, cups and lids sold and served at markets."
            rows={resaleRows}
          />
        </>
      )}

      <p className="text-[11px] text-inkSoft px-1">
        Stock totals and lot counts are live. Average cost is weighted across active lots;
        the estimated value per section is on-hand quantity times that average.
      </p>
    </div>
  );
}
