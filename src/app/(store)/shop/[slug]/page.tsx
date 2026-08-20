import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { flavorArt } from "../../_components/flavor";
import type { CatalogItem } from "../../_components/product-card";

export const dynamic = "force-dynamic";

async function getProduct(slug: string): Promise<CatalogItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("web_catalog")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data ?? null) as CatalogItem | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.name,
    description: product.subtitle
      ? `${product.name} — ${product.subtitle} of ${product.flavor_name}. Delivered fresh.`
      : product.name,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await getProduct(params.slug);
  if (!product) notFound();

  const art = flavorArt(product.sku_code);
  const soldOut = product.packs_available <= 0;
  const low = !soldOut && product.packs_available <= 5;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to shop
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Art */}
        <div className={`relative aspect-square rounded-3xl bg-gradient-to-br ${art.gradient} overflow-hidden`}>
          {product.image_url ? (
            <Image src={product.image_url} alt={product.name} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[8rem] opacity-80">
              <span aria-hidden>{art.emoji}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {product.subtitle ? (
            <span className="text-xs uppercase tracking-smallcaps font-semibold text-berry">
              {product.subtitle}
            </span>
          ) : null}
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-ink mt-1">
            {product.name}
          </h1>
          <p className="text-inkSoft mt-1">{product.flavor_name}</p>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-2xl text-ink">{formatPHP(product.price)}</span>
            <span className="text-sm text-inkSoft">
              {product.cans_per_unit} × 355&nbsp;ml cans
            </span>
          </div>

          {product.description ? (
            <p className="text-ink/80 leading-relaxed mt-5">{product.description}</p>
          ) : null}

          <div className="mt-5 text-sm">
            {soldOut ? (
              <span className="inline-flex items-center rounded-full bg-ink/10 text-ink px-3 py-1 font-semibold">
                Sold out
              </span>
            ) : low ? (
              <span className="inline-flex items-center rounded-full bg-salmonBg text-coral px-3 py-1 font-semibold">
                Only {product.packs_available} left
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-berryBg text-berry px-3 py-1 font-semibold">
                In stock
              </span>
            )}
          </div>

          {/* Checkout lands in the next phase. */}
          <div className="mt-8">
            <button
              type="button"
              disabled
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-ink/10 text-inkSoft font-semibold px-6 py-3 cursor-not-allowed"
              title="Online checkout is coming soon"
            >
              Add to cart — coming soon
            </button>
            <p className="text-xs text-inkSoft mt-2">
              Online ordering launches shortly. For now, message us at{" "}
              <span className="text-ink">notjustgroup@gmail.com</span> to order.
            </p>
          </div>

          <div className="mt-8 border-t border-border pt-5 text-sm text-inkSoft space-y-1">
            <p>🚚 Delivered fresh across the metro (delivery fee at checkout).</p>
            <p>❄️ Cold-pressed in small batches — keep chilled, drink fresh.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
