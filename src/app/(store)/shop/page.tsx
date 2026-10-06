import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PackTrio, type CatalogItem } from "../_components/product-card";
import { Reveal } from "../_components/reveal";
import { Container, Lede } from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop",
  description: "Cold-pressed collagen juice in 4, 7 and 28-can packs. Pick any mix of flavours, delivered fresh.",
};

export default async function ShopPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("web_catalog").select("*").order("sort_order", { ascending: true });
  const items = (data ?? []) as CatalogItem[];

  return (
    <Container className="pt-14 md:pt-20">
      <Reveal className="max-w-2xl">
        <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">Shop</h1>
        <Lede className="mt-5">
          Cold-pressed 330 ml cans with high-protein collagen. Pick a pack, then go all in on one flavour or mix your own.
        </Lede>
      </Reveal>

      <Reveal delay={120} className="mt-12">
        {items.length === 0 ? (
          <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] px-8 py-16 text-center">
            <p className="font-display text-2xl font-semibold text-s-fg">Fresh batch on the way.</p>
            <p className="mt-2 text-s-muted">Packs will be back in the shop shortly.</p>
          </div>
        ) : (
          <PackTrio items={items} />
        )}
      </Reveal>
    </Container>
  );
}
