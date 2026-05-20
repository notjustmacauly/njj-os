import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { formatPHP } from "@/lib/utils";
import { ingredientEmoji } from "@/lib/ingredient-icons";
import {
  hasRole,
  OWNER_PARTNER,
  OWNER_PARTNER_MANAGER,
  type Role,
} from "@/lib/roles";
import { LotsView, type LotRow } from "./lots-view";

type LotRecord = {
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
  account_code: string;
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
  const canEdit = hasRole(role, OWNER_PARTNER);
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
        "id, external_id, received_date, vendor, purchase_qty, purchase_unit, converted_qty, converted_unit, total_cost, cost_per_unit, qty_remaining, notes, received_by_name, ledger_entry_id, account_code",
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

  const lots = (lotsData ?? []) as LotRecord[];

  // Per-lot consumption count: how many batch_inputs reference each lot.
  // RPC void_ingredient_lot rejects consumed lots; UI hides the Void button
  // to match. Fetched only when there are lots to ask about.
  const consumedByLot: Record<string, number> = {};
  if (lots.length > 0) {
    const { data: consRows } = await supabase
      .from("batch_inputs")
      .select("lot_id")
      .in(
        "lot_id",
        lots.map((l) => l.id),
      );
    for (const r of (consRows ?? []) as Array<{ lot_id: string }>) {
      consumedByLot[r.lot_id] = (consumedByLot[r.lot_id] ?? 0) + 1;
    }
  }

  const decoratedLots: LotRow[] = lots.map((l) => ({
    ...l,
    consumed_count: consumedByLot[l.id] ?? 0,
  }));
  const activeLots = decoratedLots.filter((l) => Number(l.qty_remaining) > 0);
  const depletedLots = decoratedLots.filter((l) => Number(l.qty_remaining) <= 0);

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

      <LotsView
        unit={ingredient.unit}
        activeLots={activeLots}
        depletedLots={depletedLots}
        canEdit={canEdit}
      />

      <p className="text-[11px] text-inkSoft px-1">
        Click a lot to edit vendor / received date / notes. Material fields (cost, qty,
        ingredient, account) are locked — fix mistakes by voiding and logging a new lot.
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
