"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/utils";

export function ProductButton({
  emoji,
  label,
  sublabel,
  price,
  onClick,
  disabled,
  tone = "default",
}: {
  emoji?: string;
  label: string;
  sublabel?: string;
  price?: number | string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "berry" | "peri" | "yellow" | "coral";
}) {
  const toneClass =
    tone === "berry"
      ? "bg-berryBg border-berryLt text-berry hover:bg-berryBg/80"
      : tone === "peri"
        ? "bg-periBg border-peri/40 text-peri hover:bg-periBg/80"
        : tone === "yellow"
          ? "bg-yellow-50 border-yellow-200 text-yellow-900 hover:bg-yellow-100"
          : tone === "coral"
            ? "bg-salmonBg border-coral/40 text-coral hover:bg-salmonBg/80"
            : "bg-white border-border text-ink hover:bg-cream";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 min-h-[88px] text-center transition shadow-sm active:scale-[0.98] touch-manipulation",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        toneClass,
      )}
    >
      {emoji ? (
        <span aria-hidden className="text-2xl leading-none">
          {emoji}
        </span>
      ) : null}
      <span className="font-semibold text-sm leading-tight">{label}</span>
      {sublabel ? (
        <span className="text-[10px] uppercase tracking-smallcaps text-inkSoft">
          {sublabel}
        </span>
      ) : null}
      {price !== undefined && price !== null ? (
        <span className="text-xs font-mono text-inkSoft">{formatPHP(price)}</span>
      ) : null}
    </button>
  );
}
