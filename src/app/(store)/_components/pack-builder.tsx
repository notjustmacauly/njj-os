"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Minus, Plus } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { flavorArt } from "./flavor";
import { useCart } from "./cart";

export type Flavor = { code: string; name: string; cans_available: number };

type Mix = Record<string, number>;

/**
 * Build-your-own pack. Every pack is a flavour count that has to add up to
 * the cans per delivery; the "All X" quick picks just fill the counters, so
 * tweaking one turns it into a mix on its own.
 */
export function PackBuilder({
  productId,
  slug,
  packName,
  cansPerUnit,
  deliveries,
  price,
  deliveryFee,
  flavors,
}: {
  productId: string;
  slug: string;
  packName: string;
  cansPerUnit: number;
  deliveries: number;
  price: number;
  deliveryFee: number;
  flavors: Flavor[];
}) {
  const cart = useCart();
  const [added, setAdded] = React.useState(false);
  const perDelivery = cansPerUnit / deliveries;
  const empty = React.useMemo(() => Object.fromEntries(flavors.map((f) => [f.code, 0])) as Mix, [flavors]);
  const [mix, setMix] = React.useState<Mix>(empty);

  const chosen = Object.values(mix).reduce((a, b) => a + b, 0);
  const remaining = perDelivery - chosen;
  const complete = remaining === 0;
  // A flavour can't go past what's in stock for one delivery.
  const cap = (f: Flavor) => Math.min(perDelivery, f.cans_available);

  function setAll(code: string) {
    setMix({ ...empty, [code]: perDelivery });
  }
  function bump(code: string, delta: number) {
    setMix((m) => {
      const next = (m[code] ?? 0) + delta;
      const f = flavors.find((x) => x.code === code)!;
      if (next < 0 || next > cap(f)) return m;
      if (delta > 0 && chosen >= perDelivery) return m;
      return { ...m, [code]: next };
    });
  }

  const activePreset = flavors.find((f) => mix[f.code] === perDelivery)?.code ?? null;
  const isMixed = complete && !activePreset;
  const fees = deliveryFee * deliveries;
  const total = price + fees;

  function addToCart() {
    if (!complete) return;
    cart.add({
      product_id: productId,
      slug,
      name: packName,
      cans: cansPerUnit,
      deliveries,
      price,
      delivery_fee: deliveryFee,
      mix: Object.fromEntries(Object.entries(mix).filter(([, n]) => n > 0)),
    });
    setAdded(true);
    setMix(empty);
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Quick picks */}
      <div>
        <div className="text-sm font-semibold text-ink">
          {deliveries > 1 ? `Choose your weekly ${perDelivery}` : `Choose your ${perDelivery}`}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {flavors.map((f) => {
            const art = flavorArt(f.code);
            const disabled = f.cans_available < perDelivery;
            return (
              <button
                key={f.code}
                type="button"
                disabled={disabled}
                onClick={() => setAll(f.code)}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-left ring-1 transition",
                  activePreset === f.code ? "ring-2 ring-berry bg-berryBg" : "ring-border bg-white hover:ring-ink/30",
                  disabled && "opacity-40 cursor-not-allowed",
                )}
              >
                <div className="text-sm font-semibold text-ink">
                  <span aria-hidden>{art.emoji}</span> All {art.short ?? f.name}
                </div>
                <div className="text-xs text-inkSoft">{art.preset ?? f.name}</div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMix(empty)}
            className={cn(
              "rounded-xl px-3 py-2.5 text-left ring-1 transition",
              isMixed || (!complete && chosen > 0) ? "ring-2 ring-berry bg-berryBg" : "ring-border bg-white hover:ring-ink/30",
            )}
          >
            <div className="text-sm font-semibold text-ink">
              <span aria-hidden>🎨</span> Mix your own
            </div>
            <div className="text-xs text-inkSoft">Pick each flavour below</div>
          </button>
        </div>
      </div>

      {/* Counters */}
      <div className="rounded-2xl bg-white ring-1 ring-border divide-y divide-border">
        {flavors.map((f) => {
          const art = flavorArt(f.code);
          const n = mix[f.code] ?? 0;
          const atCap = n >= cap(f) || remaining <= 0;
          return (
            <div key={f.code} className="flex items-center gap-3 px-4 py-3">
              <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${art.gradient} flex items-center justify-center`} aria-hidden>
                {art.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink truncate">{f.name}</div>
                {f.cans_available <= 0 ? (
                  <div className="text-xs text-coral">Sold out</div>
                ) : f.cans_available < perDelivery ? (
                  <div className="text-xs text-coral">Only {f.cans_available} left</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bump(f.code, -1)}
                  disabled={n === 0}
                  aria-label={`One less ${f.name}`}
                  className="w-9 h-9 rounded-full ring-1 ring-border flex items-center justify-center text-ink hover:bg-cream disabled:opacity-30"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-6 text-center font-semibold tabular-nums">{n}</span>
                <button
                  type="button"
                  onClick={() => bump(f.code, 1)}
                  disabled={atCap}
                  aria-label={`One more ${f.name}`}
                  className="w-9 h-9 rounded-full ring-1 ring-border flex items-center justify-center text-ink hover:bg-cream disabled:opacity-30"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        <div className="px-4 py-2.5 flex items-center justify-between text-sm">
          <span className={cn("font-semibold", complete ? "text-berry" : "text-inkSoft")}>
            {chosen} of {perDelivery} chosen
          </span>
          {!complete ? (
            <span className="text-inkSoft">{remaining} to go</span>
          ) : deliveries > 1 ? (
            <span className="text-inkSoft">Same mix every week</span>
          ) : null}
        </div>
      </div>

      {/* Price summary */}
      <dl className="text-sm space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-inkSoft">
            {packName}
            {deliveries > 1 ? ` (${perDelivery} cans × ${deliveries} weeks)` : ""}
          </dt>
          <dd className="tabular-nums text-ink">{formatPHP(price)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-inkSoft">
            Delivery{deliveries > 1 ? ` (${formatPHP(deliveryFee)} × ${deliveries})` : ""}
          </dt>
          <dd className="tabular-nums text-ink">{formatPHP(fees)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
          <dt className="text-ink">Total</dt>
          <dd className="tabular-nums text-ink">{formatPHP(total)}</dd>
        </div>
      </dl>

      <div>
        <button
          type="button"
          onClick={addToCart}
          disabled={!complete}
          className={cn(
            "w-full inline-flex items-center justify-center rounded-full font-semibold px-6 py-3.5 transition",
            complete
              ? "bg-berry text-white hover:bg-berryLt shadow-lg shadow-berry/20"
              : "bg-ink/10 text-inkSoft cursor-not-allowed",
          )}
        >
          {complete ? "Add to cart" : `Pick ${remaining} more`}
        </button>
        {added ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-berryBg px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-semibold text-berry">
              <Check className="w-4 h-4" /> Added to your cart
            </span>
            <Link href="/shop/cart" className="font-semibold text-ink underline underline-offset-2">
              View cart &amp; checkout
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
