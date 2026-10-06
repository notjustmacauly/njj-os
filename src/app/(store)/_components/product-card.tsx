import Link from "next/link";
import Image from "next/image";
import { cn, formatPHP } from "@/lib/utils";
import { flavorArt, MIX_CANS } from "./flavor";
import { Bezel } from "./ui";
import { ArrowUpRightLine } from "./icons";

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

/** Pack tile: real can photography in a sunken well, details below. */
export function ProductCard({ item, featured = false }: { item: CatalogItem; featured?: boolean }) {
  const soldOut = item.packs_available <= 0;
  const low = !soldOut && item.packs_available <= 5;
  const perDelivery = item.cans_per_unit / (item.deliveries || 1);

  return (
    <Link href={`/shop/${item.slug}`} className="group block h-full">
      <Bezel className="h-full transition duration-500 ease-settle group-hover:-translate-y-1" innerClassName="h-full flex flex-col">
        <div className={cn("relative bg-s-sunken/60 flex-1", featured ? "min-h-[340px] md:min-h-[460px]" : "min-h-[240px]")}>
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              sizes={featured ? "(max-width: 768px) 92vw, 720px" : "(max-width: 768px) 92vw, 420px"}
              className="object-contain p-8 transition duration-700 ease-settle group-hover:scale-[1.03]"
            />
          ) : (
            <MixCans large={featured} count={Math.min(item.cans_per_unit, featured ? 5 : 3)} />
          )}
          {soldOut || low ? (
            <span className="absolute top-4 right-4 rounded-full bg-s-surface text-s-fg text-xs font-semibold px-3 py-1.5 ring-1 ring-s-line/10">
              {soldOut ? "Sold out" : `Only ${item.packs_available} left`}
            </span>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <h3 className={cn("font-display font-semibold tracking-[-0.02em] text-s-fg", featured ? "text-3xl" : "text-2xl")}>
              {item.name}
            </h3>
            <p className="text-sm text-s-muted mt-1">
              {item.deliveries > 1 ? `${perDelivery} cans a week, ${item.deliveries} weeks` : `${item.cans_per_unit} cans, your mix`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-lg font-semibold tabular-nums text-s-fg">{formatPHP(item.price)}</span>
            <span className="w-10 h-10 rounded-full bg-s-line/[0.06] flex items-center justify-center transition duration-300 ease-settle group-hover:bg-s-invert group-hover:text-s-invert-fg">
              <ArrowUpRightLine className="w-4 h-4" />
            </span>
          </div>
        </div>
      </Bezel>
    </Link>
  );
}

/** Asymmetric trio: the biggest pack leads, the other two stack beside it. */
export function PackTrio({ items }: { items: CatalogItem[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.cans_per_unit - a.cans_per_unit);
  const [lead, ...rest] = sorted;
  return (
    <div className="grid gap-5 md:grid-cols-12">
      <div className="md:col-span-7 md:row-span-2">
        <ProductCard item={lead} featured />
      </div>
      {rest.map((it) => (
        <div key={it.id} className="md:col-span-5">
          <ProductCard item={it} />
        </div>
      ))}
    </div>
  );
}

// Fanned can cutouts, the art for any mix-your-own pack.
export function MixCans({
  large = false,
  count = 3,
  hero = false,
}: {
  large?: boolean;
  count?: number;
  /** Product-page well: cans centred and sized to the larger frame. */
  hero?: boolean;
}) {
  const cans = Array.from({ length: count }, (_, i) => MIX_CANS[i % MIX_CANS.length]);
  const mid = (count - 1) / 2;
  return (
    <div className={cn("absolute inset-0 flex justify-center", hero ? "items-center" : "items-end pb-[9%]")}>
      {cans.map((src, i) => {
        const off = i - mid;
        return (
          <div
            key={i}
            className={cn(
              "relative aspect-[1/2] -mx-[3%] transition duration-700 ease-settle group-hover:-translate-y-1",
              hero ? "w-[19%]" : large ? "w-[21%]" : "w-[17%]",
            )}
            style={{ transform: `rotate(${off * 7}deg) translateY(${Math.abs(off) * 6}%)`, zIndex: 10 - Math.abs(Math.round(off)) }}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes={large ? "180px" : "120px"}
              className="object-contain drop-shadow-[0_18px_22px_rgb(18_18_18/0.22)]"
            />
          </div>
        );
      })}
    </div>
  );
}

/** Small can thumbnail for a flavour (used in builders and summaries). */
export function CanThumb({ code, className }: { code: string; className?: string }) {
  const art = flavorArt(code);
  return (
    <span className={cn("relative inline-block w-7 h-12 shrink-0", className)}>
      {art.can ? <Image src={art.can} alt="" fill sizes="28px" className="object-contain" /> : null}
    </span>
  );
}
