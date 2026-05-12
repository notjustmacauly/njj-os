import * as React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "default"
  | "berry"
  | "peri"
  | "yellow"
  | "coral"
  | "green"
  | "muted";

const TONES: Record<Tone, string> = {
  default: "bg-creamDk text-inkSoft",
  berry: "bg-berryBg text-berry",
  peri: "bg-periBg text-peri",
  yellow: "bg-yellowBg text-yellow",
  coral: "bg-salmonBg text-coral",
  green: "bg-greenBg text-green",
  muted: "bg-creamDk text-inkSoft",
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const TIER_TONE: Record<string, Tone> = {
  A: "berry",
  B: "peri",
  C: "yellow",
  D: "muted",
};

export function tierTone(code: string | null | undefined): Tone {
  if (!code) return "default";
  return TIER_TONE[code] ?? "default";
}

// ── StatusBadge — auto picks the right color pair from the status string ──
const STATUS_TONE: Record<string, Tone> = {
  // Pending
  Pending: "yellow",
  pending: "yellow",
  Draft: "muted",
  draft: "muted",
  // Success
  Paid: "green",
  paid: "green",
  Delivered: "green",
  delivered: "green",
  "Checked in": "green",
  checked_in: "green",
  Active: "green",
  active: "green",
  // Receivable / billed
  Billed: "berry",
  billed: "berry",
  Receivable: "berry",
  receivable: "berry",
  // Cancelled / inactive
  Cancelled: "muted",
  cancelled: "muted",
  Canceled: "muted",
  Inactive: "muted",
  inactive: "muted",
  // Info / new
  New: "peri",
  new: "peri",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = STATUS_TONE[status] ?? "default";
  return (
    <Badge tone={tone} className={className}>
      {status}
    </Badge>
  );
}
