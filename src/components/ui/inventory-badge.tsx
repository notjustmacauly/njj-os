import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Color-coded remaining-can count.
 * - oversold (remaining < 0): coral text + outline (alert)
 * - depleted (remaining === 0): coral filled
 * - low (1–20% of produced): yellow filled
 * - healthy (> 20%): green filled
 *
 * `produced` is optional — if omitted, the low/healthy split falls back to
 * a flat "any positive remaining is healthy" classification.
 */
export function InventoryBadge({
  remaining,
  produced,
  className,
}: {
  remaining: number;
  produced?: number;
  className?: string;
}) {
  let tone: "oversold" | "zero" | "low" | "healthy";
  if (remaining < 0) tone = "oversold";
  else if (remaining === 0) tone = "zero";
  else if (produced && produced > 0 && remaining <= produced * 0.2) tone = "low";
  else tone = "healthy";

  const styles: Record<typeof tone, string> = {
    oversold: "border border-coral text-coral bg-white",
    zero: "bg-salmonBg text-coral",
    low: "bg-yellowBg text-yellow",
    healthy: "bg-greenBg text-green",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        styles[tone],
        className,
      )}
      title={
        produced != null
          ? `${remaining} remaining of ${produced} produced`
          : `${remaining} remaining`
      }
    >
      {tone === "oversold" ? `oversold ${remaining}` : `${remaining}`}
    </span>
  );
}
