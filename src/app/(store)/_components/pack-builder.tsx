"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import { flavorArt } from "./flavor";

export type Flavor = { code: string; name: string; cans_available: number };

type Mix = Record<string, number>;

/**
 * Build-your-own pack. Every pack is a flavour count that has to add up to
 * the cans per delivery; the "All X" quick picks just fill the counters, so
 * tweaking one turns it into a mix on its own.
 */
export function PackBuilder({
  packName,
  cansPerUnit,
  deliveries,
  price,
  deliveryFee,
  flavors,
  orderEmail,
}: {
  packName: string;
  cansPerUnit: number;
  deliveries: number;
  price: number;
  deliveryFee: number;
  flavors: Flavor[];
  orderEmail: string;
}) {
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

  const mixLine = flavors
    .filter((f) => mix[f.code] > 0)
    .map((f) => `${mix[f.code]}× ${f.name}`)
    .join(", ");
  const mailto =
    `mailto:${orderEmail}?subject=${encodeURIComponent(`Order: ${packName}`)}` +
    `&body=${encodeURIComponent(
      `Hi NotJust! I'd like to order:\n\n${packName}\n` +
        (deliveries > 1 ? `Weekly mix (${perDelivery} cans × ${deliveries} weeks): ` : "Mix: ") +
        `${mixLine}\n\nTotal: ${formatPHP(total)} (incl. ${formatPHP(fees)} delivery)\n\n` +
        `Name:\nMobile:\nDelivery address:\n`,
    )}`;

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

      {/* Until online checkout lands, send the built order by email. */}
      <div>
        <a
          href={complete ? mailto : undefined}
          aria-disabled={!complete}
          className={cn(
            "w-full inline-flex items-center justify-center rounded-full font-semibold px-6 py-3.5 transition",
            complete
              ? "bg-berry text-white hover:bg-berryLt shadow-lg shadow-berry/20"
              : "bg-ink/10 text-inkSoft cursor-not-allowed pointer-events-none",
          )}
        >
          {complete ? "Order this pack" : `Pick ${remaining} more`}
        </a>
        <p className="text-xs text-inkSoft mt-2">
          Online checkout is launching soon. For now this sends your order to us by email and we&apos;ll confirm
          payment and delivery with you.
        </p>
      </div>
    </div>
  );
}
