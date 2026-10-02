import { createClient } from "@/lib/supabase/server";
import { WebProductsClient, type WebProductRow } from "./products-client";

export const dynamic = "force-dynamic";

export default async function WebsiteProductsPage() {
  const supabase = await createClient();
  const [{ data: products }, { data: catalog }, { data: skus }] = await Promise.all([
    supabase
      .from("web_products")
      .select("id, slug, name, subtitle, description, sku_code, cans_per_unit, deliveries, delivery_fee, price, image_url, badge, is_published, sort_order")
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("web_catalog").select("id, packs_available"),
    supabase.from("skus").select("code, name").eq("is_active", true).order("code"),
  ]);

  const stock: Record<string, number> = {};
  for (const c of (catalog ?? []) as Array<{ id: string; packs_available: number }>) stock[c.id] = c.packs_available;

  return (
    <WebProductsClient
      initial={(products ?? []) as WebProductRow[]}
      stock={stock}
      skus={(skus ?? []) as Array<{ code: string; name: string }>}
    />
  );
}
