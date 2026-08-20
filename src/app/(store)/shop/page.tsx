import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type CatalogItem } from "../_components/product-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop",
  description: "Cold-pressed juice packs — 4-packs and 7-day sets, delivered fresh.",
};

export default async function ShopPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("web_catalog")
    .select("*")
    .order("sort_order", { ascending: true });
  const items = (data ?? []) as CatalogItem[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">Shop</h1>
        <p className="text-inkSoft mt-2">
          Cold-pressed 330&nbsp;ml cans with high-protein collagen — in 4-packs and
          7-day sets, delivered fresh.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-inkSoft">Our shop is being stocked — check back shortly.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
