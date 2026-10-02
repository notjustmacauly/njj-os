import Link from "next/link";
import Image from "next/image";
import { formatPHP } from "@/lib/utils";
import { flavorArt, MIX_CANS, MIX_GRADIENT } from "./flavor";

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
  deliveries: number;
  delivery_fee: number | string;
};

export function ProductCard({ item }: { item: CatalogItem }) {
  const isMix = !item.sku_code;
  const art = flavorArt(item.sku_code);
  const soldOut = item.packs_available <= 0;
  const low = !soldOut && item.packs_available <= 5;

  return (
    <Link
      href={`/shop/${item.slug}`}
      className="group block rounded-2xl border border-border bg-white overflow-hidden shadow-card hover:shadow-lg transition"
    >
      <div className={`relative aspect-[4/5] bg-gradient-to-br ${isMix ? MIX_GRADIENT : art.gradient}`}>
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 70vw, 320px"
            className="object-contain p-6 drop-shadow-[0_18px_28px_rgba(26,19,15,0.22)] transition duration-300 group-hover:scale-[1.04]"
          />
        ) : isMix ? (
          <MixCans />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-80">
            <span aria-hidden>{art.emoji}</span>
          </div>
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 text-ink text-sm font-bold px-3 py-1">
          {item.cans_per_unit} cans
        </span>
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
          <h3 className="font-display font-semibold text-ink leading-tight group-hover:text-berry transition">
            {item.name}
          </h3>
          <span className="text-ink font-semibold tabular-nums shrink-0">{formatPHP(item.price)}</span>
        </div>
        <p className="text-sm text-inkSoft">
          {isMix ? item.subtitle ?? "Mix your flavours" : [item.subtitle, item.flavor_name].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

// Three cans fanned out — the art for any mix-your-own pack.
export function MixCans({ large = false }: { large?: boolean }) {
  const tilt = ["-rotate-[10deg] translate-x-[18%]", "z-10 -translate-y-[4%]", "rotate-[10deg] -translate-x-[18%]"];
  return (
    <div className="absolute inset-0 flex items-end justify-center pb-[12%]">
      {MIX_CANS.map((src, i) => (
        <div key={src} className={`relative ${large ? "w-[30%]" : "w-[32%]"} aspect-[1/2] ${tilt[i]} transition duration-300 group-hover:scale-[1.04]`}>
          <Image
            src={src}
            alt=""
            fill
            sizes={large ? "160px" : "110px"}
            className="object-contain drop-shadow-[0_18px_24px_rgba(26,19,15,0.25)]"
          />
        </div>
      ))}
    </div>
  );
}
