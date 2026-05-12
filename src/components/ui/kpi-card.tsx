import * as React from "react";
import { cn } from "@/lib/utils";

type Accent = "berry" | "peri" | "coral" | "yellow" | "green";

const STRIPE: Record<Accent, string> = {
  berry: "bg-berry",
  peri: "bg-peri",
  coral: "bg-coral",
  yellow: "bg-yellow",
  green: "bg-green",
};

const NUMBER_COLOR: Record<Accent, string> = {
  berry: "text-berry",
  peri: "text-peri",
  coral: "text-coral",
  yellow: "text-yellow",
  green: "text-green",
};

export function KpiCard({
  label,
  value,
  sub,
  accent = "berry",
  className,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: Accent;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white border border-border rounded-lg shadow-card overflow-hidden",
        className,
      )}
    >
      <div className={cn("h-1", STRIPE[accent])} />
      <div className="px-5 py-4">
        <div className="text-xs uppercase tracking-smallcaps text-inkSoft mb-2 font-semibold">
          {label}
        </div>
        <div className={cn("font-serif font-bold text-3xl", NUMBER_COLOR[accent])}>
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-inkSoft">{sub}</div> : null}
      </div>
    </div>
  );
}
