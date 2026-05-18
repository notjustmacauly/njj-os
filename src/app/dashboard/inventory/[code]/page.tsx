import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, formatPHP } from "@/lib/utils";
import { ingredientEmoji } from "@/lib/ingredient-icons";
import {
  hasRole,
  OWNER_PARTNER,
  OWNER_PARTNER_MANAGER,
  type Role,
} from "@/lib/roles";

type LotRow = {
  id: string;
  external_id: string | null;
  received_date: string;
  vendor: string | null;
  purchase_qty: number | string;
  purchase_unit: string;
  converted_qty: number | string;
  converted_unit: string;
  total_cost: number | string;
  cost_per_unit: number | string;
  qty_remaining: number | string;
  notes: string | null;
  received_by_name: string | null;
  ledger_entry_id: string | null;
};

export default async function IngredientLotsPage({
  params,
}: {
  params: { code: string };
}) {
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
  const code = decodeURIComponent(params.code).toUpperCase();

  const [{ data: ingredient }, { data: lotsData }, { data: onHand }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("code, name, unit, type")
      .eq("code", code)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("ingredient_lots")
      .select(
        "id, external_id, received_date, vendor, purchase_qty, purchase_unit, converted_qty, converted_unit, total_cost, cost_per_unit, qty_remaining, notes, received_by_name, ledger_entry_id",
      )
      .eq("ingredient_code", code)
      .is("deleted_at", null)
      .order("received_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("inventory_on_hand")
      .select("qty_on_hand, active_lots, avg_cost_per_unit, last_received_date")
      .eq("code", code)
      .maybeSingle(),
  ]);

  if (!ingredient) notFound();

  const lots = (lotsData ?? []) as LotRow[];
  const activeLots = lots.filter((l) => Number(l.qty_remaining) > 0);
  const depletedLots = lots.filter((l) => Number(l.qty_remaining) <= 0);

  const totalOnHand = Number(onHand?.qty_on_hand ?? 0);
  const avgCost = onHand?.avg_cost_per_unit != null ? Number(onHand.avg_cost_per_unit) : null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/inventory"
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to inventory
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
            <span aria-hidden>{ingredientEmoji(code)}</span>
            {ingredient.name}
          </h1>
          <p className="text-xs text-inkSoft mt-1 font-mono">{code} · {ingredient.unit}</p>
        </div>
        {canReceive ? (
          <Link
            href={`/dashboard/inventory/receive?ingredient=${encodeURIComponent(code)}`}
            className={buttonClasses({ variant: "berryGhost", size: "sm" })}
          >
            <Plus className="w-3.5 h-3.5" />
            Log receipt
          </Link>
        ) : null}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="On hand"
          value={`${totalOnHand.toFixed(1)} ${ingredient.unit}`}
          accent="berry"
        />
        <Stat
          label="Active lots"
          value={String(onHand?.active_lots ?? 0)}
          accent="peri"
        />
        <Stat
          label="Avg cost"
          value={
            avgCost != null
              ? `${formatPHP(avgCost)}/${ingredient.unit}`
              : "—"
          }
          accent="coral"
        />
      </div>

      <section className="space-y-2">
        <h2 className="font-serif font-bold text-lg text-ink">
          Active lots ({activeLots.length})
        </h2>
        {activeLots.length === 0 ? (
          <p className="text-sm text-inkSoft">No active lots. Log a receipt to add stock.</p>
        ) : (
          <LotsTable rows={activeLots} unit={ingredient.unit} depleted={false} />
        )}
      </section>

      {depletedLots.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-serif font-bold text-lg text-ink">
            Depleted lots ({depletedLots.length})
          </h2>
          <LotsTable rows={depletedLots} unit={ingredient.unit} depleted />
        </section>
      ) : null}

      <p className="text-[11px] text-inkSoft px-1">
        Lot quantities decrement only via batch consumption. To correct a mistake on a
        lot, soft-delete it via SQL and log a new receipt — never edit qty in place.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "berry" | "peri" | "coral";
}) {
  const stripe =
    accent === "berry" ? "bg-berry" : accent === "peri" ? "bg-peri" : "bg-coral";
  const num =
    accent === "berry" ? "text-berry" : accent === "peri" ? "text-peri" : "text-coral";
  return (
    <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
      <div className={`h-1 ${stripe}`} />
      <div className="px-5 py-4">
        <div className="text-xs uppercase tracking-smallcaps text-inkSoft mb-1 font-semibold">
          {label}
        </div>
        <div className={`font-serif font-bold text-2xl ${num} tabular-nums`}>{value}</div>
      </div>
    </div>
  );
}

function LotsTable({
  rows,
  unit,
  depleted,
}: {
  rows: LotRow[];
  unit: string;
  depleted: boolean;
}) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-cream text-inkSoft">
          <tr className="text-left">
            <th className="px-4 py-2 font-semibold w-36">Lot</th>
            <th className="px-4 py-2 font-semibold w-28">Received</th>
            <th className="px-4 py-2 font-semibold">Vendor</th>
            <th className="px-4 py-2 font-semibold w-32">Purchase</th>
            <th className="px-4 py-2 font-semibold w-32 text-right">Remaining</th>
            <th className="px-4 py-2 font-semibold w-32 text-right">Total cost</th>
            <th className="px-4 py-2 font-semibold w-28 text-right">Per unit</th>
            <th className="px-4 py-2 font-semibold w-16 text-center">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const qtyRemaining = Number(r.qty_remaining);
            const convertedQty = Number(r.converted_qty);
            const rowClass = depleted ? "opacity-60" : "";
            return (
              <tr key={r.id} className={`border-t border-border ${rowClass}`}>
                <td className="px-4 py-2.5 font-mono text-xs text-ink">
                  {r.external_id ?? r.id.slice(0, 8)}
                </td>
                <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                  {formatDate(r.received_date)}
                </td>
                <td className="px-4 py-2.5 text-sm text-ink truncate">
                  {r.vendor || <span className="text-inkSoft">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-inkSoft font-mono">
                  {Number(r.purchase_qty)} {r.purchase_unit}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {depleted ? (
                    <span className="text-inkSoft italic">depleted</span>
                  ) : (
                    <span>
                      {qtyRemaining.toFixed(1)} / {convertedQty.toFixed(1)} {unit}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {formatPHP(r.total_cost)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-berry">
                  {formatPHP(r.cost_per_unit)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {r.ledger_entry_id ? (
                    <Link
                      href={`/dashboard/finance/accounts`}
                      className="inline-flex text-inkSoft hover:text-berry"
                      title="View linked ledger entry"
                      aria-label="Ledger entry"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <span className="text-inkSoft text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
