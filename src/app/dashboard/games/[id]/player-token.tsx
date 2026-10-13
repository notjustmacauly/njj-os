"use client";

import { cn } from "@/lib/utils";
import { tierOf } from "../logic";

// Pastel avatar colour from the name, so each person keeps the same colour.
const AVATAR = ["#F4C0D1", "#9FE1CB", "#FAC775", "#B5D4F4", "#CECBF6", "#F5C4B3", "#C0DD97"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export const TIER_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  beginner: { bg: "#C0DD97", fg: "#27500A", label: "Beginner" },
  intermediate: { bg: "#B5D4F4", fg: "#0C447C", label: "Intermediate" },
  advanced: { bg: "#CECBF6", fg: "#3C3489", label: "Advanced" },
  pro: { bg: "#FAC775", fg: "#633806", label: "Pro" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

/**
 * A player on a court or in a queue. Tap to select (then tap another to swap)
 * or drag onto another player to swap.
 */
export function PlayerToken({
  name,
  rating,
  selected,
  onCourt,
  size = "md",
  meta,
  onSelect,
  dragData,
  onDropData,
  disabled,
}: {
  name: string;
  rating: number;
  selected?: boolean;
  onCourt?: boolean;
  size?: "sm" | "md";
  meta?: string;
  onSelect?: () => void;
  dragData?: string;
  onDropData?: (from: string) => void;
  disabled?: boolean;
}) {
  const t = TIER_STYLE[tierOf(rating)];
  const av = size === "sm" ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      draggable={!disabled && !!dragData}
      onDragStart={(e) => {
        if (!dragData) return;
        e.dataTransfer.setData("text/plain", dragData);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (onDropData) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        if (!onDropData) return;
        e.preventDefault();
        const from = e.dataTransfer.getData("text/plain");
        if (from && from !== dragData) onDropData(from);
      }}
      title={`${name} · ${t.label} ${rating.toFixed(1)}`}
      aria-pressed={selected}
      className={cn(
        "group relative flex flex-col items-center gap-0.5 rounded-2xl px-1 pt-1 pb-0.5 transition",
        "cursor-grab active:cursor-grabbing active:scale-95 disabled:cursor-default",
        selected && "-translate-y-0.5",
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full font-bold text-[#26215C] ring-2 ring-white shadow-[0_4px_10px_rgba(26,26,46,0.18)] transition",
          av,
          selected ? "outline outline-[3px] outline-offset-2 outline-[#EF9F27]" : "group-hover:scale-105",
        )}
        style={{ background: avatarColor(name) }}
      >
        {initials(name)}
        <span
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 text-[10px] font-bold leading-4 ring-[1.5px] ring-white tabular-nums"
          style={{ background: t.bg, color: t.fg }}
        >
          {rating.toFixed(1)}
        </span>
      </span>
      <span
        className={cn(
          "mt-1.5 max-w-[84px] truncate rounded-full px-1.5 text-[11px] font-semibold leading-4",
          onCourt ? "bg-black/35 text-white" : "text-ink",
        )}
      >
        {shortName(name)}
      </span>
      {meta ? <span className="text-[10px] leading-3 text-inkSoft tabular-nums">{meta}</span> : null}
    </button>
  );
}
