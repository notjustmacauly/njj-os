import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPHP } from "@/lib/utils";
import { ingredientEmoji } from "@/lib/ingredient-icons";
import {
  hasRole,
  OWNER_PARTNER,
  OWNER_PARTNER_MANAGER,
  type Role,
} from "@/lib/roles";

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
  // Different scales per type — additives are used in tiny amounts, produce
  // by the kg, cans by the hundreds. Configurable later.
  if (type === "packaging") return 50;
  if (type === "additive") return 1;
  return 5;
}

function lastReceivedLabel(iso: string | null): string {
  if (!iso) return "Never";
  // received_date is a DATE — interpret as Asia/Manila midnight to avoid off-by-one.
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
  // Show one decimal for kg/L (typical for produce), no decimals for unit counts.
  const decimals = unit === "unit" ? 0 : 1;
  return `${qty.toFixed(decimals)} ${unit}`;
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">📦</span>
            Inventory
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            On-hand totals across active ingredients. Each receipt is a separate lot;
            batches deduct FIFO.
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
          emoji="📦"
          title="No ingredients yet"
          description="Add ingredients via the Production module to start tracking lots."
        />
      ) : (
        <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-4 py-2 font-semibold">Ingredient</th>
                <th className="px-4 py-2 font-semibold w-36 text-right">On hand</th>
                <th className="px-4 py-2 font-semibold w-20 text-right">Lots</th>
                <th className="px-4 py-2 font-semibold w-32 text-right">Avg cost</th>
                <th className="px-4 py-2 font-semibold w-32">Last received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const qty = Number(r.qty_on_hand ?? 0);
                const low = qty > 0 && qty < lowStockThreshold(r.ingredient_type);
                const empty = qty === 0;
                const avgCost =
                  r.avg_cost_per_unit != null
                    ? Number(r.avg_cost_per_unit)
                    : null;
                return (
                  <tr
                    key={r.code}
                    className="border-t border-border hover:bg-cream/30 cursor-pointer"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/inventory/${encodeURIComponent(r.code)}`}
                        className="text-ink hover:text-berry inline-flex items-center gap-2"
                      >
                        <span aria-hidden className="text-lg leading-none">
                          {ingredientEmoji(r.code)}
                        </span>
                        <span className="font-semibold">{r.name}</span>
                        <span className="text-xs text-inkSoft font-mono">
                          {r.code}
                        </span>
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        empty
                          ? "text-inkSoft"
                          : low
                            ? "text-coral font-semibold"
                            : "text-ink"
                      }`}
                    >
                      {formatQty(qty, r.unit)}
                      {low ? (
                        <span className="ml-1 text-[10px] uppercase tracking-smallcaps">
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
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-inkSoft px-1">
        Stock totals are live from the lots table. Avg cost is weighted across active
        lots — individual batch costs come from the actual lot used.
      </p>
    </div>
  );
}
