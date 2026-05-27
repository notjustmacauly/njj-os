import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { IngredientRef } from "@/components/ui/ingredient-picker";
import { EditDraftForm } from "./edit-draft-form";

export default async function EditDraftPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { finalize?: string };
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
  if (role !== "owner" && role !== "partner" && role !== "manager") {
    redirect("/dashboard/production");
  }

  const [
    { data: batchData },
    { data: inputsData },
    { data: skusData },
    { data: ingredientsData },
    { data: lotsData },
  ] = await Promise.all([
    supabase
      .from("batches")
      .select(
        "id, external_id, batch_date, sku_code, units_planned, units_produced, wastage, ph, brix, qc_passed, qc_notes, staff_name, staff_user_id, notes, status",
      )
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("batch_inputs")
      .select("id, ingredient_code, qty_used, unit, cost_per_unit, lot_id")
      .eq("batch_id", params.id),
    supabase
      .from("skus")
      .select("code, name, short_label, can_ingredient_code")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("ingredients")
      .select("code, name, type, unit, cost_per_unit")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("ingredient_lots")
      .select(
        "id, external_id, ingredient_code, qty_remaining, cost_per_unit, received_date",
      )
      .is("deleted_at", null)
      .gt("qty_remaining", 0)
      .order("received_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (!batchData) notFound();
  if (batchData.status !== "draft") {
    redirect(`/dashboard/production/${params.id}`);
  }

  const isOwnerPartner = role === "owner" || role === "partner";
  const isOwnDraft = batchData.staff_user_id === user.id;
  if (!isOwnerPartner && !isOwnDraft) {
    redirect("/dashboard/production");
  }

  const skus = (skusData ?? []) as Array<{
    code: string;
    name: string;
    short_label: string;
    can_ingredient_code: string | null;
  }>;
  const ingredients = (ingredientsData ?? []) as IngredientRef[];
  const lots = (lotsData ?? []) as Array<{
    id: string;
    external_id: string | null;
    ingredient_code: string;
    qty_remaining: number | string;
    cost_per_unit: number | string;
    received_date: string;
  }>;
  const inputs = (inputsData ?? []) as Array<{
    id: string;
    ingredient_code: string;
    qty_used: number | string;
    unit: string;
    cost_per_unit: number | string | null;
    lot_id: string | null;
  }>;

  const finalizeOpenParam = searchParams?.finalize === "1";

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/production"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to production
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">📝</span>
          Edit draft
          {batchData.external_id ? (
            <span className="ml-2 font-mono text-base text-inkSoft">
              {batchData.external_id}
            </span>
          ) : null}
        </h1>
      </header>

      <EditDraftForm
        batchId={params.id}
        externalId={batchData.external_id}
        initial={{
          batch_date: batchData.batch_date,
          sku_code: batchData.sku_code,
          units_planned: Number(batchData.units_planned ?? 0),
          staff_name: batchData.staff_name ?? "",
          notes: batchData.notes ?? "",
          inputs: inputs.map((it) => ({
            ingredient_code: it.ingredient_code,
            qty_used: Number(it.qty_used ?? 0),
            unit: it.unit,
            lot_id: it.lot_id,
          })),
        }}
        skus={skus}
        ingredients={ingredients}
        lots={lots}
        canFinalize={isOwnerPartner}
        finalizeOpenInitial={finalizeOpenParam && isOwnerPartner}
      />
    </div>
  );
}
