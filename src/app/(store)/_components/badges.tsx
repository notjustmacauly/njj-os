import { cn } from "@/lib/utils";
import {
  AwardLine,
  CalendarCheckLine,
  CrownLine,
  DumbbellLine,
  FlameLine,
  HourglassLine,
  MedalLine,
  ShieldCheckLine,
  SparklesLine,
  TrendingUpLine,
} from "./icons";

// Leaderboard badges (rows come from the web_badges view). Colours are fixed
// hues on translucent fills so they read in both light and dark themes.
export type BadgeKey =
  | "champion"
  | "podium"
  | "on_fire"
  | "unbeaten"
  | "regular"
  | "iron"
  | "first_event"
  | "rising"
  | "eligible"
  | "provisional";
export type BadgeRow = { sport: string; season: number; player_id: string; badge: BadgeKey; detail: string };

const PLACE = ["", "1st", "2nd", "3rd"];
const MEDAL = ["", "#C9962A", "#8E9AA8", "#B0703C"];

export const BADGES: Record<BadgeKey, { name: string; label: (d: string) => string; blurb: string; Icon: (p: { className?: string }) => JSX.Element; color: string }> = {
  champion: { name: "Champion", label: (d) => `Season ${d} champion`, blurb: "Won a past season. The crown stays for good.", Icon: CrownLine, color: "#C9962A" },
  podium: { name: "Podium", label: (d) => `${PLACE[Number(d)] ?? d} this season`, blurb: "Top 3 on the season table.", Icon: MedalLine, color: "#C9962A" },
  on_fire: { name: "On fire", label: (d) => `On fire, ${d} wins in a row`, blurb: "3 or more wins in a row.", Icon: FlameLine, color: "#E0622F" },
  unbeaten: { name: "Unbeaten", label: () => "Unbeaten night", blurb: "A whole event (3+ games) without a loss.", Icon: ShieldCheckLine, color: "#2F8F5B" },
  regular: { name: "Regular", label: (d) => `Regular, ${d} events`, blurb: "4 or more events this season.", Icon: CalendarCheckLine, color: "#2F6FA8" },
  iron: { name: "Iron", label: (d) => `Iron, most events (${d})`, blurb: "Played the most events this season.", Icon: DumbbellLine, color: "#5B6170" },
  first_event: { name: "First event", label: () => "First event", blurb: "Welcome. Just played their first event.", Icon: SparklesLine, color: "#C2417A" },
  rising: { name: "Rising", label: (d) => `Rising, +${d} rating`, blurb: "Biggest rating gain this season.", Icon: TrendingUpLine, color: "#1F8A7A" },
  eligible: { name: "Award eligible", label: () => "Award eligible", blurb: "4+ events and 16+ matches this season.", Icon: AwardLine, color: "#1D6B73" },
  provisional: { name: "Provisional", label: () => "Provisional rating", blurb: "Still settling in. Ratings firm up after a few games.", Icon: HourglassLine, color: "#8A8A99" },
};
// Display order (most prestigious first).
export const BADGE_ORDER: BadgeKey[] = ["champion", "podium", "on_fire", "unbeaten", "rising", "eligible", "regular", "iron", "first_event", "provisional"];

export function sortBadges<T extends { badge: BadgeKey }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => BADGE_ORDER.indexOf(a.badge) - BADGE_ORDER.indexOf(b.badge));
}

/** Round icon chip (compact) or icon + label pill. */
export function Badge({ badge, detail, compact }: { badge: BadgeKey; detail: string; compact?: boolean }) {
  const b = BADGES[badge];
  const color = badge === "podium" ? MEDAL[Number(detail)] ?? b.color : b.color;
  const label = b.label(detail);
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold", compact ? "h-7 w-7 justify-center" : "h-7 px-2.5 text-xs")}
      style={{ color, backgroundColor: `${color}2e`, boxShadow: `inset 0 0 0 1px ${color}59` }}
    >
      <b.Icon className="w-3.5 h-3.5" />
      {compact ? null : <span>{label}</span>}
    </span>
  );
}

export function BadgeLegend({ keys }: { keys?: BadgeKey[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {(keys ?? BADGE_ORDER).map((k) => {
        const b = BADGES[k];
        return (
          <li key={k} className="flex gap-3">
            <Badge badge={k} detail={k === "podium" ? "1" : ""} compact />
            <div>
              <p className="text-sm font-semibold text-s-fg">{b.name}</p>
              <p className="text-sm text-s-muted">{b.blurb}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
