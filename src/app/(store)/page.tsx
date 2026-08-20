import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type CatalogItem } from "./_components/product-card";

export const dynamic = "force-dynamic";

export default async function StoreHome() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("web_catalog")
    .select("*")
    .order("sort_order", { ascending: true });
  const items = (data ?? []) as CatalogItem[];
  const featured = items.slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-salmonBg via-cream to-creamDk" />
        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-28 text-center">
          <p className="text-xs uppercase tracking-smallcaps font-semibold text-berry mb-3">
            Cold-pressed · No added sugar · Delivered fresh
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl font-bold text-ink leading-[1.05] max-w-3xl mx-auto">
            Juice that makes you glow.
          </h1>
          <p className="mt-5 text-lg text-inkSoft max-w-xl mx-auto">
            Real fruit, cold-pressed into 355&nbsp;ml cans. Grab a 4-pack or a 7-day
            set and we&rsquo;ll bring it to your door.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/shop"
              className="inline-flex items-center rounded-full bg-berry text-white font-semibold px-6 py-3 hover:bg-berryLt transition"
            >
              Shop the juices
            </Link>
          </div>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 ? (
        <section className="max-w-6xl mx-auto px-4 py-14">
          <div className="flex items-end justify-between mb-6">
            <h2 className="font-serif text-2xl font-bold text-ink">Fan favourites</h2>
            <Link href="/shop" className="text-sm font-semibold text-berry hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Value props */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { t: "Cold-pressed daily", d: "Pressed in small batches — never from concentrate." },
            { t: "Delivered fresh", d: "Straight to your door across the metro." },
            { t: "Pay by QR", d: "Scan, pay, done — or use a card at checkout." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl border border-border bg-white p-5">
              <div className="font-serif font-bold text-ink">{v.t}</div>
              <p className="text-sm text-inkSoft mt-1">{v.d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
