"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, formatPHP } from "@/lib/utils";
import type { PublicEvent } from "../../_components/events";
import { MinusLine, PlusLine } from "../../_components/icons";
import { Btn } from "../../_components/ui";

function Stepper({ value, onChange, max, label }: { value: number; onChange: (n: number) => void; max: number; label: string }) {
  const b =
    "w-10 h-10 rounded-full ring-1 ring-s-line/15 flex items-center justify-center text-s-fg transition hover:bg-s-line/[0.05] active:scale-[0.95] disabled:opacity-25";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0} aria-label={`One less ${label}`} className={b}>
        <MinusLine className="w-4 h-4" />
      </button>
      <span className="w-7 text-center font-semibold tabular-nums text-s-fg">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`One more ${label}`} className={b}>
        <PlusLine className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Passes per sport (plus paddle rental) leading into pass checkout. */
export function PassPicker({ event }: { event: PublicEvent }) {
  const router = useRouter();
  const price = Number(event.pass_price);
  const paddlePrice = event.paddle_price == null ? null : Number(event.paddle_price);
  const [qty, setQty] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(event.sports.map((s, i) => [s.id, event.sports.length === 1 && s.left > 0 && i === 0 ? 1 : 0])),
  );
  const [paddles, setPaddles] = React.useState(0);

  const passes = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = passes * price + (paddlePrice ?? 0) * paddles;
  const allSoldOut = event.sports.length > 0 && event.sports.every((s) => s.left <= 0);

  function go() {
    if (!passes) return;
    const p = new URLSearchParams();
    for (const [id, n] of Object.entries(qty)) if (n > 0) p.append("s", `${id}:${n}`);
    if (paddles) p.set("paddles", String(paddles));
    router.push(`/events/${event.slug}/checkout?${p.toString()}`);
  }

  return (
    <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 sm:p-7">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold tracking-[-0.03em] tabular-nums text-s-fg">{formatPHP(price)}</span>
        <span className="text-sm text-s-muted">per pass, one sport</span>
      </div>

      {event.sports.length === 0 ? (
        <p className="mt-5 text-s-muted">Passes open soon.</p>
      ) : allSoldOut ? (
        <p className="mt-5 rounded-[18px] bg-s-sunken px-5 py-4 text-s-fg">
          <span className="font-semibold">Sold out.</span> Watch this page for the next date.
        </p>
      ) : (
        <>
          <div className="mt-6 rounded-[22px] ring-1 ring-s-line/[0.08]">
            {event.sports.map((s, i) => (
              <div key={s.id} className={cn("flex items-center gap-3 px-5 py-3.5", i > 0 && "border-t border-s-line/[0.06]", s.left <= 0 && "opacity-45")}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-s-fg">{s.name}</div>
                  <div className="text-xs text-s-muted">{s.left <= 0 ? "Sold out" : `${s.left} spots left`}</div>
                </div>
                <Stepper value={qty[s.id] ?? 0} onChange={(n) => setQty((q) => ({ ...q, [s.id]: n }))} max={Math.min(s.left, 10)} label={`${s.name} pass`} />
              </div>
            ))}
            {paddlePrice != null ? (
              <div className="flex items-center gap-3 px-5 py-3.5 border-t border-s-line/[0.06]">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-s-fg">Paddle rental</div>
                  <div className="text-xs text-s-muted">{formatPHP(paddlePrice)} each, optional</div>
                </div>
                <Stepper value={paddles} onChange={setPaddles} max={Math.max(passes, 0)} label="paddle rental" />
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex justify-between text-base font-semibold text-s-fg">
            <span>Total</span>
            <span className="tabular-nums">{formatPHP(total)}</span>
          </div>
          <Btn onClick={go} disabled={!passes} arrow={passes > 0} className={cn("mt-5 w-full", passes > 0 && "justify-between")}>
            {passes ? `Get ${passes} pass${passes === 1 ? "" : "es"}` : "Choose a sport"}
          </Btn>
          <p className="mt-3 text-xs text-s-muted text-center">QR passes are emailed right after payment.</p>
        </>
      )}
    </div>
  );
}
