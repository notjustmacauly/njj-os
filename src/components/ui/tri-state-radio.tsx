"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "danger";

const TONE: Record<Tone, string> = {
  default: "bg-cream text-ink border-border hover:bg-creamDk",
  success: "bg-greenBg text-green border-green/30",
  danger: "bg-salmonBg text-coral border-coral/30",
};

/**
 * Three-way radio for tri-state booleans (true / false / null).
 * Used for QC pass status — "Passed" / "Failed" / "Not yet checked".
 */
export function TriStateRadio({
  value,
  onChange,
  trueLabel = "Yes",
  falseLabel = "No",
  nullLabel = "Not yet",
  disabled,
  className,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  trueLabel?: string;
  falseLabel?: string;
  nullLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  function btn(target: boolean | null, label: string, tone: Tone) {
    const active = value === target;
    return (
      <button
        key={String(target)}
        type="button"
        disabled={disabled}
        onClick={() => onChange(target)}
        aria-pressed={active}
        className={cn(
          "h-10 px-4 text-sm font-medium border rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/30 disabled:opacity-50 disabled:cursor-not-allowed",
          active ? TONE[tone] : "bg-white text-inkSoft border-border hover:bg-cream",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      className={cn("inline-flex flex-wrap gap-2", className)}
    >
      {btn(true, trueLabel, "success")}
      {btn(false, falseLabel, "danger")}
      {btn(null, nullLabel, "default")}
    </div>
  );
}
