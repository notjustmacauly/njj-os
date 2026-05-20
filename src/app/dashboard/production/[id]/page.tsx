import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { IngredientRef } from "@/components/ui/ingredient-picker";
import { BatchDetailClient } from "./batch-detail-client";

export default async function BatchDetailPage({
  params,
}: {
  params: { id: string };
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
  const role = roleRow?.role as import("@/lib/roles").Role | null;
  if (!role) redirect("/dashboard");
  // Per matrix: all roles view the batch; owner/partner/manager manage it.
  const canManage = role === "owner" || role === "partner" || role === "manager";
  const canDelete = canManage;

  const [
    { data: batchData },
    { data: inputsData },
    { data: invData },
    { data: skusData },
    { data: ingredientsData },
  ] = await Promise.all([
    supabase
      .from("batches")
      .select(
        "id, external_id, batch_date, sku_code, units_planned, units_produced, wastage, ph, brix, qc_passed, qc_notes, staff_name, cogs_total, notes, is_backfill, created_at, deleted_at",
      )
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("batch_inputs")
      .select(
        "id, batch_id, ingredient_code, qty_used, unit, cost_per_unit, lot_id, cost_per_unit_at_use, ingredient:ingredients(name, type, unit, cost_per_unit), lot:ingredient_lots(external_id, received_date, vendor)",
      )
      .eq("batch_id", params.id),
    supabase
      .from("inventory_summary")
      .select("batch_id, remaining, remaining_signed, sold_via_orders, sold_via_pos, deducted, units_produced, sku_code")
      .eq("batch_id", params.id)
      .maybeSingle(),
    supabase
      .from("skus")
      .select("code, name, short_label")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("ingredients")
      .select("code, name, type, unit, cost_per_unit")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
  ]);

  if (!batchData) notFound();

  // Linked records — orders + POS + deductions referencing this batch
  const [{ data: usedInOrders }, { data: usedInPos }, { data: usedInDeductions }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select("qty, order:orders(id, external_id, order_date, channel)")
        .eq("batch_id", params.id),
      supabase
        .from("pos_transaction_items")
        .select("qty, transaction:pos_transactions(id, external_id, transaction_date)")
        .eq("batch_id", params.id)
        .eq("item_type", "juice"),
      supabase
        .from("deduction_items")
        .select("qty, deduction:deductions(id, external_id, deduction_date, reason)")
        .eq("batch_id", params.id),
    ]);

  const ingredients = (ingredientsData ?? []) as IngredientRef[];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/production"
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to production
      </Link>

      <BatchDetailClient
        batch={
          batchData as unknown as {
            id: string;
            external_id: string | null;
            batch_date: string;
            sku_code: string;
            units_planned: number;
            units_produced: number;
            wastage: number;
            ph: number | string | null;
            brix: number | string | null;
            qc_passed: boolean | null;
            qc_notes: string | null;
            staff_name: string | null;
            cogs_total: number | string;
            notes: string | null;
            is_backfill: boolean | null;
          }
        }
        initialInputs={
          (inputsData ?? []) as unknown as Array<{
            id: string;
            batch_id: string;
            ingredient_code: string;
            qty_used: number | string;
            unit: string;
            cost_per_unit: number | string;
            lot_id: string | null;
            cost_per_unit_at_use: number | string | null;
            ingredient: { name: string; type: string; unit: string; cost_per_unit: number | string } | null;
            lot:
              | { external_id: string | null; received_date: string; vendor: string | null }
              | { external_id: string | null; received_date: string; vendor: string | null }[]
              | null;
          }>
        }
        inventory={
          invData as unknown as {
            remaining: number;
            remaining_signed: number;
            sold_via_orders: number;
            sold_via_pos: number;
            deducted: number;
            units_produced: number;
            sku_code: string;
          } | null
        }
        skus={(skusData ?? []) as Array<{ code: string; name: string; short_label: string }>}
        ingredients={ingredients}
        usedInOrders={
          (usedInOrders ?? []) as unknown as Array<{
            qty: number;
            order: {
              id: string;
              external_id: string | null;
              order_date: string;
              channel: string;
            } | null;
          }>
        }
        usedInPos={
          (usedInPos ?? []) as unknown as Array<{
            qty: number;
            transaction: {
              id: string;
              external_id: string | null;
              transaction_date: string;
            } | null;
          }>
        }
        usedInDeductions={
          (usedInDeductions ?? []) as unknown as Array<{
            qty: number;
            deduction: {
              id: string;
              external_id: string | null;
              deduction_date: string;
              reason: string | null;
            } | null;
          }>
        }
        canManage={canManage}
        canDelete={canDelete}
      />
    </div>
  );
}
