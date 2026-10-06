"use client";

import * as React from "react";
import Link from "next/link";
import { cn, formatPHP } from "@/lib/utils";
import { flavorArt } from "./flavor";
import { useCart } from "./cart";
import { CanThumb } from "./product-card";
import { CheckLine, MinusLine, PlusLine } from "./icons";
import { Btn } from "./ui";

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
    setAdded(false);
    setMix({ ...empty, [code]: perDelivery });
  }
  function bump(code: string, delta: number) {
    setAdded(false);
    setMix((m) => {
      const next = (m[code] ?? 0) + delta;
      const f = flavors.find((x) => x.code === code)!;
      if (next < 0 || next > cap(f)) return m;
      if (delta > 0 && chosen >= perDelivery) return m;
      return { ...m, [code]: next };
    });
  }

  const activePreset = flavors.find((f) => mix[f.code] === perDelivery)?.code ?? null;
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
    <div className="mt-10 space-y-7">
      {/* Quick picks */}
      <div>
        <p className="text-sm font-semibold text-s-fg">
          {deliveries > 1 ? `Choose your weekly ${perDelivery}` : `Choose your ${perDelivery}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {flavors.map((f) => {
            const art = flavorArt(f.code);
            const disabled = f.cans_available < perDelivery;
            const on = activePreset === f.code;
            return (
              <button
                key={f.code}
                type="button"
                disabled={disabled}
                onClick={() => setAll(f.code)}
                aria-pressed={on}
                className={cn(
                  "rounded-full px-4 py-2.5 text-sm font-semibold ring-1 transition duration-300 ease-settle active:scale-[0.98]",
                  on ? "bg-s-invert text-s-invert-fg ring-s-invert" : "bg-s-surface text-s-fg ring-s-line/15 hover:ring-s-line/40",
                  disabled && "opacity-35 pointer-events-none",
                )}
              >
                All {art.short ?? f.name}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-s-muted">Or set your own mix below.</p>
      </div>

      {/* Counters */}
      <div className="rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.08]">
        {flavors.map((f, i) => {
          const n = mix[f.code] ?? 0;
          const atCap = n >= cap(f) || remaining <= 0;
          return (
            <div key={f.code} className={cn("flex items-center gap-4 px-5 py-3.5", i > 0 && "border-t border-s-line/[0.06]")}>
              <CanThumb code={f.code} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-s-fg">{f.name}</div>
                {f.cans_available <= 0 ? (
                  <div className="text-xs text-s-muted">Sold out</div>
                ) : f.cans_available < perDelivery ? (
                  <div className="text-xs text-s-muted">Only {f.cans_available} left</div>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => bump(f.code, -1)}
                  disabled={n === 0}
                  aria-label={`One less ${f.name}`}
                  className="w-10 h-10 rounded-full ring-1 ring-s-line/15 flex items-center justify-center text-s-fg transition hover:bg-s-line/[0.05] active:scale-[0.95] disabled:opacity-25"
                >
                  <MinusLine className="w-4 h-4" />
                </button>
                <span className="w-7 text-center font-semibold tabular-nums text-s-fg">{n}</span>
                <button
                  type="button"
                  onClick={() => bump(f.code, 1)}
                  disabled={atCap}
                  aria-label={`One more ${f.name}`}
                  className="w-10 h-10 rounded-full ring-1 ring-s-line/15 flex items-center justify-center text-s-fg transition hover:bg-s-line/[0.05] active:scale-[0.95] disabled:opacity-25"
                >
                  <PlusLine className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between border-t border-s-line/[0.06] px-5 py-3 text-sm">
          <span className="font-semibold tabular-nums text-s-fg">
            {chosen} of {perDelivery} chosen
          </span>
          <span className="text-s-muted">
            {!complete ? `${remaining} to go` : deliveries > 1 ? "Same mix every week" : "Ready"}
          </span>
        </div>
      </div>

      {/* Price summary */}
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-s-muted">{packName}</dt>
          <dd className="tabular-nums text-s-fg">{formatPHP(price)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-s-muted">
            Delivery{deliveries > 1 ? ` (${formatPHP(deliveryFee)} × ${deliveries})` : ""}
          </dt>
          <dd className="tabular-nums text-s-fg">{formatPHP(fees)}</dd>
        </div>
        <div className="flex justify-between border-t border-s-line/[0.08] pt-3 text-base font-semibold text-s-fg">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPHP(total)}</dd>
        </div>
      </dl>

      <div>
        <Btn onClick={addToCart} disabled={!complete} arrow={complete} className={complete ? "w-full justify-between" : "w-full"}>
          {complete ? "Add to cart" : `Pick ${remaining} more`}
        </Btn>
        {added ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] bg-s-sunken px-5 py-3.5 text-sm">
            <span className="flex items-center gap-2 font-semibold text-s-fg">
              <CheckLine className="w-4 h-4" /> Added to your cart
            </span>
            <Link href="/shop/cart" className="font-semibold text-s-fg underline underline-offset-4">
              View cart
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
