import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewOrderForm } from "./order-form";
import type {
  BatchRef,
  PartnerRef,
  SkuRef,
  TierRef,
} from "../order-items-editor";

export type PartnerOption = PartnerRef & {
  name: string;
  external_id: string | null;
  delivery_fee: number | string | null;
};

export default async function NewOrderPage() {
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
  // Owner/partner/manager can create orders (matrix). Staff is view-only.
  if (role !== "owner" && role !== "partner" && role !== "manager") {
    redirect("/dashboard/orders");
  }

  const [{ data: partnersData }, { data: tiersData }, { data: skusData }, { data: invData }] =
    await Promise.all([
      supabase
        .from("partners")
        .select(
          "id, name, external_id, tier_code, delivery_fee, price_pcl, price_acg, price_wpm",
        )
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("partner_tiers")
        .select("code, price_pcl, price_acg, price_wpm")
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("skus")
        .select("code, name, short_label, retail_price")
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("inventory_summary")
        .select("batch_id, batch_external_id, sku_code, remaining, batch_date")
        .gt("remaining", 0)
        .order("batch_date", { ascending: false }),
    ]);

  const partners = (partnersData ?? []) as PartnerOption[];
  const tiers = (tiersData ?? []) as TierRef[];
  const skus = (skusData ?? []) as SkuRef[];

  const batchesBySku: Record<string, BatchRef[]> = {};
  for (const r of (invData ?? []) as Array<{
    batch_id: string;
    batch_external_id: string;
    sku_code: string;
    remaining: number;
  }>) {
    if (!batchesBySku[r.sku_code]) batchesBySku[r.sku_code] = [];
    batchesBySku[r.sku_code].push({
      id: r.batch_id,
      external_id: r.batch_external_id,
      remaining: r.remaining,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to orders
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">📦</span>
          New Order
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          The order ID (ORD-YYMMDD-NNN) is assigned automatically when you save.
        </p>
      </header>

      <NewOrderForm
        partners={partners}
        tiers={tiers}
        skus={skus}
        batchesBySku={batchesBySku}
      />
    </div>
  );
}
