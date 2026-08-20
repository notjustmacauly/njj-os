import Link from "next/link";
import Image from "next/image";
import { formatPHP } from "@/lib/utils";
import { flavorArt } from "./flavor";

export type CatalogItem = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  flavor_name: string | null;
  sku_code: string | null;
  cans_per_unit: number;
  price: number | string;
  image_url: string | null;
  badge: string | null;
  packs_available: number;
};

export function ProductCard({ item }: { item: CatalogItem }) {
  const art = flavorArt(item.sku_code);
  const soldOut = item.packs_available <= 0;
  const low = !soldOut && item.packs_available <= 5;

  return (
    <Link
      href={`/shop/${item.slug}`}
      className="group block rounded-2xl border border-border bg-white overflow-hidden shadow-card hover:shadow-lg transition"
    >
      <div className={`relative aspect-[4/3] bg-gradient-to-br ${art.gradient}`}>
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-80">
            <span aria-hidden>{art.emoji}</span>
          </div>
        )}
        {item.badge ? (
          <span className="absolute top-3 left-3 rounded-full bg-white/90 text-ink text-xs font-semibold px-2.5 py-1">
            {item.badge}
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute top-3 right-3 rounded-full bg-ink/80 text-white text-xs font-semibold px-2.5 py-1">
            Sold out
          </span>
        ) : low ? (
          <span className="absolute top-3 right-3 rounded-full bg-coral text-white text-xs font-semibold px-2.5 py-1">
            Only {item.packs_available} left
          </span>
        ) : null}
      </div>
      <div className="p-4 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif font-bold text-ink leading-tight group-hover:text-berry transition">
            {item.name}
          </h3>
          <span className="font-mono text-ink shrink-0">{formatPHP(item.price)}</span>
        </div>
        <p className="text-sm text-inkSoft">
          {item.subtitle ? `${item.subtitle} · ` : ""}
          {item.flavor_name}
        </p>
      </div>
    </Link>
  );
}
