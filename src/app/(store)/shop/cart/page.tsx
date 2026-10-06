"use client";

import Link from "next/link";
import { formatPHP } from "@/lib/utils";
import { cartTotals, useCart, type CartLine } from "../../_components/cart";
import { MixChips } from "../../_components/mix-chips";
import { CanThumb } from "../../_components/product-card";
import { ArrowLeftLine, TrashLine } from "../../_components/icons";
import { Btn, Container, Panel } from "../../_components/ui";

export default function CartPage() {
  const { lines, ready, remove } = useCart();
  const t = cartTotals(lines);

  return (
    <Container className="pt-8 md:pt-12">
      <Link href="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition">
        <ArrowLeftLine className="w-4 h-4" /> Keep shopping
      </Link>
      <h1 className="mt-6 font-display font-semibold tracking-[-0.04em] text-5xl text-s-fg">Your cart</h1>

      {!ready ? (
        <div className="mt-10 grid gap-3 md:w-7/12" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-32 rounded-[24px] bg-s-sunken animate-pulse" />
          ))}
        </div>
      ) : lines.length === 0 ? (
        <Panel className="mt-10 py-16 text-center">
          <p className="font-display text-3xl font-semibold text-s-fg">Nothing in here yet.</p>
          <p className="mt-2 text-s-muted">Pick a pack and choose your flavours.</p>
          <div className="mt-7">
            <Btn href="/shop" arrow>
              Build a pack
            </Btn>
          </div>
        </Panel>
      ) : (
        <div className="mt-10 grid gap-8 md:grid-cols-12 md:items-start">
          <ul className="md:col-span-7 grid gap-3">
            {lines.map((l) => (
              <CartRow key={l.key} line={l} onRemove={() => remove(l.key)} />
            ))}
          </ul>

          <aside className="md:col-span-5 md:sticky md:top-28">
            <Panel>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-s-muted">Packs</dt>
                  <dd className="tabular-nums text-s-fg">{formatPHP(t.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-s-muted">Delivery{t.weeks > 1 ? ` (${t.weeks} drops)` : ""}</dt>
                  <dd className="tabular-nums text-s-fg">{formatPHP(t.delivery)}</dd>
                </div>
                <div className="flex justify-between border-t border-s-line/[0.08] pt-3 text-base font-semibold text-s-fg">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatPHP(t.total)}</dd>
                </div>
              </dl>
              {t.weeks > 1 ? <p className="mt-3 text-xs text-s-muted">Packs arriving on the same day share one delivery fee.</p> : null}
              <Btn href="/shop/checkout" arrow className="mt-6 w-full justify-between">
                Checkout
              </Btn>
            </Panel>
          </aside>
        </div>
      )}
    </Container>
  );
}

function CartRow({ line, onRemove }: { line: CartLine; onRemove: () => void }) {
  const perDelivery = line.cans / line.deliveries;
  return (
    <li className="rounded-[24px] bg-s-surface ring-1 ring-s-line/[0.07] p-3 pr-4 flex gap-4 items-center">
      <div className="w-24 h-28 shrink-0 rounded-[18px] bg-s-sunken flex items-center justify-center gap-0.5" aria-hidden>
        {Object.entries(line.mix)
          .filter(([, n]) => n > 0)
          .slice(0, 3)
          .map(([code]) => (
            <CanThumb key={code} code={code} className="w-6 h-14" />
          ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/shop/${line.slug}`} className="font-display text-xl font-semibold tracking-[-0.02em] text-s-fg hover:underline underline-offset-4">
            {line.name}
          </Link>
          <span className="tabular-nums font-semibold text-s-fg">{formatPHP(line.price)}</span>
        </div>
        <p className="text-xs text-s-muted mt-0.5">
          {line.deliveries > 1 ? `${perDelivery} cans a week for ${line.deliveries} weeks` : `${line.cans} cans`}
        </p>
        <MixChips mix={line.mix} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${line.name}`}
        className="self-start w-10 h-10 rounded-full flex items-center justify-center text-s-muted hover:text-s-fg hover:bg-s-line/[0.06] transition active:scale-[0.95]"
      >
        <TrashLine className="w-4 h-4" />
      </button>
    </li>
  );
}
