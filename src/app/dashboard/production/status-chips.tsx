"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Chip = { value: string; label: string; count: number };

export function ProductionStatusChips({
  paramKey = "status",
  chips,
}: {
  paramKey?: string;
  chips: Chip[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(paramKey) ?? "";

  function setStatus(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(paramKey, value);
    else next.delete(paramKey);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => {
        const active = current === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            onClick={() => setStatus(chip.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition",
              active
                ? "bg-berry text-white"
                : "bg-white border border-border text-ink hover:bg-cream",
            )}
            aria-pressed={active}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                active ? "bg-white/20 text-white" : "bg-cream text-inkSoft",
              )}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
