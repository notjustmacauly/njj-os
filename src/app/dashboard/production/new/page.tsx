import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { IngredientRef } from "@/components/ui/ingredient-picker";
import { NewBatchForm } from "./batch-form";

function defaultStaffName(email: string | null | undefined): string {
  if (!email) return "";
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function NewBatchPage() {
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
  // Per matrix: owner/partner/manager can create batches.
  if (role !== "owner" && role !== "partner" && role !== "manager") {
    redirect("/dashboard/production");
  }

  const [{ data: skusData }, { data: ingredientsData }] = await Promise.all([
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

  const skus = (skusData ?? []) as Array<{
    code: string;
    name: string;
    short_label: string;
  }>;
  const ingredients = (ingredientsData ?? []) as IngredientRef[];

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
          <span aria-hidden className="mr-2">🏭</span>
          New Batch
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          The batch ID (BATCH-YYMMDD-NNN) is assigned automatically when you save.
        </p>
      </header>

      <NewBatchForm
        skus={skus}
        ingredients={ingredients}
        defaultStaffName={defaultStaffName(user.email)}
      />
    </div>
  );
}
