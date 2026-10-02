import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";
import { flavorArt, MIX_GRADIENT } from "../../_components/flavor";
import { MixCans, type CatalogItem } from "../../_components/product-card";
import { PackBuilder, type Flavor } from "../../_components/pack-builder";

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
    description: `${product.name} — ${product.cans_per_unit} cold-pressed collagen juices, your choice of flavours. Delivered fresh.`,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await getProduct(params.slug);
  if (!product) notFound();

  const supabase = await createClient();
  const { data: flavorRows } = await supabase.from("web_flavors").select("code, name, cans_available");
  // A single-SKU pack only offers its own flavour; mix packs offer them all.
  const ORDER = ["PCL", "ACG", "WPM"];
  const rank = (c: string) => (ORDER.indexOf(c) + 1 || 99);
  const flavors = ((flavorRows ?? []) as Flavor[])
    .filter((f) => !product.sku_code || f.code === product.sku_code)
    .sort((a, b) => rank(a.code) - rank(b.code));

  const isMix = !product.sku_code;
  const art = flavorArt(product.sku_code);
  const deliveries = product.deliveries ?? 1;
  const perDelivery = product.cans_per_unit / deliveries;
  const soldOut = product.packs_available <= 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to shop
      </Link>

      <div className="grid gap-8 md:grid-cols-2 md:items-start">
        {/* Art */}
        <div className={`group relative aspect-square rounded-3xl bg-gradient-to-br ${isMix ? MIX_GRADIENT : art.gradient} overflow-hidden md:sticky md:top-24`}>
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 90vw, 480px"
              priority
              className="object-contain p-10 drop-shadow-[0_25px_35px_rgba(26,19,15,0.25)]"
            />
          ) : isMix ? (
            <MixCans large />
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
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink mt-1">
            {product.name}
          </h1>

          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-2xl text-ink font-semibold tabular-nums">{formatPHP(product.price)}</span>
            <span className="text-sm text-inkSoft">
              {deliveries > 1
                ? `${perDelivery} cans a week × ${deliveries} weeks`
                : `${product.cans_per_unit} × 330 ml cans`}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {["High-protein collagen", "No added sugar", "Cold-pressed"].map((f) => (
              <span
                key={f}
                className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink/80 ring-1 ring-border"
              >
                {f}
              </span>
            ))}
          </div>

          {product.description ? (
            <p className="text-ink/80 leading-relaxed mt-5">{product.description}</p>
          ) : null}

          {soldOut ? (
            <div className="mt-6 rounded-2xl bg-ink/5 px-4 py-3 text-sm text-ink">
              <span className="font-semibold">Sold out for now.</span> We press in small batches — check back soon.
            </div>
          ) : (
            <PackBuilder
              packName={product.name}
              cansPerUnit={product.cans_per_unit}
              deliveries={deliveries}
              price={Number(product.price)}
              deliveryFee={Number(product.delivery_fee ?? 0)}
              flavors={flavors}
              orderEmail={COMPANY.email}
            />
          )}

          <div className="mt-8 border-t border-border pt-5 text-sm text-inkSoft space-y-1">
            <p>
              🚚 Delivered fresh across the metro — {formatPHP(product.delivery_fee ?? 0)} per delivery
              {deliveries > 1 ? ", every week for four weeks" : ""}.
            </p>
            <p>❄️ Cold-pressed in small batches — keep chilled, drink fresh.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
