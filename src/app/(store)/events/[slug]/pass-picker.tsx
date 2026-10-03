"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { cn, formatPHP } from "@/lib/utils";
import type { PublicEvent } from "../../_components/events";

function Stepper({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        aria-label={`One less ${label}`}
        className="w-9 h-9 rounded-full ring-1 ring-border flex items-center justify-center text-ink hover:bg-cream disabled:opacity-30"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`One more ${label}`}
        className="w-9 h-9 rounded-full ring-1 ring-border flex items-center justify-center text-ink hover:bg-cream disabled:opacity-30"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Price box: passes per sport (+ paddle rental) → pass checkout. */
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
    <aside className="rounded-3xl bg-white ring-1 ring-border p-6 md:sticky md:top-24">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-ink tabular-nums">{formatPHP(price)}</span>
        <span className="text-sm text-inkSoft">per pass · one sport</span>
      </div>

      {event.sports.length === 0 ? (
        <p className="mt-4 text-sm text-inkSoft">Passes open soon.</p>
      ) : allSoldOut ? (
        <p className="mt-4 rounded-2xl bg-ink/5 px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Sold out.</span> Follow us for the next one!
        </p>
      ) : (
        <>
          <div className="mt-5 rounded-2xl ring-1 ring-border divide-y divide-border">
            {event.sports.map((s) => (
              <div key={s.id} className={cn("flex items-center gap-3 px-4 py-3", s.left <= 0 && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{s.name}</div>
                  <div className={cn("text-xs", s.left <= 0 ? "text-inkSoft" : s.left <= 5 ? "text-coral" : "text-inkSoft")}>
                    {s.left <= 0 ? "Sold out" : `${s.left} spots left`}
                  </div>
                </div>
                <Stepper
                  value={qty[s.id] ?? 0}
                  onChange={(n) => setQty((q) => ({ ...q, [s.id]: n }))}
                  max={Math.min(s.left, 10)}
                  label={`${s.name} pass`}
                />
              </div>
            ))}
            {paddlePrice != null ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">Paddle rental</div>
                  <div className="text-xs text-inkSoft">{formatPHP(paddlePrice)} each · optional</div>
                </div>
                <Stepper value={paddles} onChange={setPaddles} max={Math.max(passes, 0)} label="paddle rental" />
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatPHP(total)}</span>
          </div>
          <button
            type="button"
            onClick={go}
            disabled={!passes}
            className={cn(
              "mt-4 w-full inline-flex items-center justify-center rounded-full font-semibold px-6 py-3.5 transition",
              passes ? "bg-berry text-white hover:bg-berryLt shadow-lg shadow-berry/20" : "bg-ink/10 text-inkSoft cursor-not-allowed",
            )}
          >
            {passes ? `Get ${passes} pass${passes === 1 ? "" : "es"}` : "Choose a sport"}
          </button>
          <p className="mt-2 text-xs text-inkSoft text-center">QR passes are emailed to you right after payment.</p>
        </>
      )}
    </aside>
  );
}
