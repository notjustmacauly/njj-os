"use client";

import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { cartTotals, useCart, type CartLine } from "../../_components/cart";
import { MixChips } from "../../_components/mix-chips";

export default function CartPage() {
  const { lines, ready, remove } = useCart();
  const t = cartTotals(lines);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/shop" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-6">
        <ArrowLeft className="w-4 h-4" />
        Keep shopping
      </Link>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">Your cart</h1>

      {!ready ? null : lines.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-white ring-1 ring-border p-10 text-center">
          <p className="text-inkSoft">Your cart is empty.</p>
          <Link
            href="/shop"
            className="mt-5 inline-flex items-center rounded-full bg-berry text-white font-semibold px-6 py-3 hover:bg-berryLt transition"
          >
            Build a pack
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px] md:items-start">
          <ul className="space-y-3">
            {lines.map((l) => (
              <CartRow key={l.key} line={l} onRemove={() => remove(l.key)} />
            ))}
          </ul>

          <aside className="rounded-3xl bg-white ring-1 ring-border p-6 md:sticky md:top-24">
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-inkSoft">Packs</dt>
                <dd className="tabular-nums">{formatPHP(t.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-inkSoft">
                  Delivery{t.weeks > 1 ? ` (${t.weeks} drops)` : ""}
                </dt>
                <dd className="tabular-nums">{formatPHP(t.delivery)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPHP(t.total)}</dd>
              </div>
            </dl>
            {t.weeks > 1 ? (
              <p className="mt-3 text-xs text-inkSoft">
                Packs that arrive on the same day share one delivery fee.
              </p>
            ) : null}
            <Link
              href="/shop/checkout"
              className="mt-5 w-full inline-flex items-center justify-center rounded-full bg-berry text-white font-semibold px-6 py-3.5 hover:bg-berryLt transition shadow-lg shadow-berry/20"
            >
              Checkout
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}

function CartRow({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  const perDelivery = line.cans / line.deliveries;
  return (
    <li className="rounded-2xl bg-white ring-1 ring-border p-4 flex gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/shop/${line.slug}`} className="font-display font-semibold text-ink hover:text-berry">
            {line.name}
          </Link>
          <span className="tabular-nums font-semibold">{formatPHP(line.price)}</span>
        </div>
        <p className="text-xs text-inkSoft mt-0.5">
          {line.deliveries > 1 ? `${perDelivery} cans a week × ${line.deliveries} weeks` : `${line.cans} cans`}
        </p>
        <MixChips mix={line.mix} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${line.name}`}
        className="self-start p-2 rounded-full text-inkSoft hover:bg-salmonBg hover:text-coral"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}
