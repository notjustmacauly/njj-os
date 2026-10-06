import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { MixCans, type CatalogItem } from "../../_components/product-card";
import { PackBuilder, type Flavor } from "../../_components/pack-builder";
import { ArrowLeftLine, LeafLine, SnowflakeLine, TruckLine } from "../../_components/icons";
import { Bezel, Container } from "../../_components/ui";

export const dynamic = "force-dynamic";

async function getProduct(slug: string): Promise<CatalogItem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("web_catalog").select("*").eq("slug", slug).maybeSingle();
  return (data ?? null) as CatalogItem | null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) return { title: "Not found" };
  return {
    title: product.name,
    description: `${product.name}: ${product.cans_per_unit} cold-pressed collagen juices, your choice of flavours. Delivered fresh.`,
  };
}

const ORDER = ["PCL", "ACG", "WPM"];

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug);
  if (!product) notFound();

  const supabase = await createClient();
  const { data: flavorRows } = await supabase.from("web_flavors").select("code, name, cans_available");
  const rank = (c: string) => ORDER.indexOf(c) + 1 || 99;
  // A single-SKU pack only offers its own flavour; mix packs offer them all.
  const flavors = ((flavorRows ?? []) as Flavor[])
    .filter((f) => !product.sku_code || f.code === product.sku_code)
    .sort((a, b) => rank(a.code) - rank(b.code));

  const deliveries = product.deliveries ?? 1;
  const perDelivery = product.cans_per_unit / deliveries;
  const soldOut = product.packs_available <= 0;

  return (
    <Container className="pt-8 md:pt-12">
      <Link href="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition">
        <ArrowLeftLine className="w-4 h-4" /> Shop
      </Link>

      <div className="mt-6 grid gap-10 md:grid-cols-12 md:items-start">
        <div className="md:col-span-7 md:sticky md:top-28">
          <Bezel>
            <div className="relative aspect-[5/4] md:aspect-square bg-s-sunken/60">
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  priority
                  sizes="(max-width: 768px) 92vw, 760px"
                  className="object-contain p-12"
                />
              ) : (
                <MixCans hero count={Math.min(product.cans_per_unit, 5)} />
              )}
            </div>
          </Bezel>
        </div>

        <div className="md:col-span-5">
          <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">
            {product.name}
          </h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-semibold tabular-nums text-s-fg">{formatPHP(product.price)}</span>
            <span className="text-s-muted">
              {deliveries > 1 ? `${perDelivery} cans a week for ${deliveries} weeks` : `${product.cans_per_unit} × 330 ml cans`}
            </span>
          </div>
          {product.description ? (
            <p className="mt-6 text-lg text-s-muted leading-relaxed max-w-[48ch]">{product.description}</p>
          ) : null}

          {soldOut ? (
            <div className="mt-8 rounded-[20px] bg-s-sunken px-5 py-4 text-s-fg">
              <span className="font-semibold">Sold out for now.</span> We press in small batches, so check back soon.
            </div>
          ) : (
            <PackBuilder
              productId={product.id}
              slug={product.slug}
              packName={product.name}
              cansPerUnit={product.cans_per_unit}
              deliveries={deliveries}
              price={Number(product.price)}
              deliveryFee={Number(product.delivery_fee ?? 0)}
              flavors={flavors}
            />
          )}

          <ul className="mt-10 grid gap-3 text-sm text-s-muted border-t border-s-line/[0.08] pt-6">
            <li className="flex items-center gap-3">
              <LeafLine className="w-5 h-5 text-s-fg" /> High-protein collagen, no added sugar, cold-pressed.
            </li>
            <li className="flex items-center gap-3">
              <TruckLine className="w-5 h-5 text-s-fg" />
              Delivered fresh across the metro. {formatPHP(product.delivery_fee ?? 0)} per delivery
              {deliveries > 1 ? ", every week for four weeks" : ""}.
            </li>
            <li className="flex items-center gap-3">
              <SnowflakeLine className="w-5 h-5 text-s-fg" /> Pressed in small batches. Keep chilled, drink fresh.
            </li>
          </ul>
        </div>
      </div>
    </Container>
  );
}
