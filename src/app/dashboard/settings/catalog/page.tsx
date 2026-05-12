import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CatalogClient } from "./catalog-client";
import type { PartnerTierRow } from "./types";

export default async function CatalogPage() {
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
  const role = roleRow?.role as "admin" | "manager" | "ops" | "staff" | null;
  if (role !== "admin" && role !== "manager") redirect("/dashboard");

  const [
    { data: skusData },
    { data: ticketTypesData },
    { data: posProductsData },
    { data: posBundlesData },
    { data: partnerTiersData },
  ] = await Promise.all([
    supabase
      .from("skus")
      .select("code, name, short_label, size_ml, retail_price, is_active")
      .order("code"),
    supabase
      .from("ticket_types")
      .select("id, code, event_category, name, price, is_active, notes")
      .order("event_category")
      .order("name"),
    supabase
      .from("pos_products")
      .select("id, code, name, emoji, price, category, sort_order, is_active, notes")
      .is("deleted_at", null)
      .order("sort_order")
      .order("code"),
    supabase
      .from("pos_bundles")
      .select(
        "id, code, name, emoji, price, total_cans, is_flavor_pickable, fixed_breakdown, sort_order, is_active, notes",
      )
      .is("deleted_at", null)
      .order("sort_order")
      .order("code"),
    supabase
      .from("partner_tiers")
      .select("code, name, price_pcl, price_acg, price_wpm")
      .eq("is_active", true)
      .order("code"),
  ]);

  return (
    <CatalogClient
      skus={skusData ?? []}
      ticketTypes={ticketTypesData ?? []}
      posProducts={posProductsData ?? []}
      bundles={posBundlesData ?? []}
      tiers={(partnerTiersData ?? []) as PartnerTierRow[]}
    />
  );
}
