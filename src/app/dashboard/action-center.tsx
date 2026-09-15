import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Accent = "coral" | "yellow" | "berry" | "peri" | "green";
export type ActionItem = {
  label: string;
  count: number;
  href: string;
  accent: Accent;
  hint?: string;
};

const BORDER: Record<Accent, string> = {
  coral: "border-l-coral",
  yellow: "border-l-yellow",
  berry: "border-l-berry",
  peri: "border-l-peri",
  green: "border-l-green",
};
const TEXT: Record<Accent, string> = {
  coral: "text-coral",
  yellow: "text-yellow",
  berry: "text-berry",
  peri: "text-peri",
  green: "text-green",
};

/**
 * "Needs your attention" — the person's required actions, surfaced up top so
 * they don't have to go hunting. Only items with a non-zero count render; when
 * there's nothing, it shows an all-clear state.
 */
export function ActionCenter({ items }: { items: ActionItem[] }) {
  const actionable = items.filter((i) => i.count > 0);
  const total = actionable.reduce((s, i) => s + i.count, 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-serif font-bold text-lg text-ink">Needs your attention</h2>
        {total > 0 ? (
          <span className="text-xs font-semibold text-coral">{total} to action</span>
        ) : null}
      </div>
      {actionable.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-5 text-sm text-inkSoft flex items-center gap-2">
          <span className="text-green font-bold">✓</span> You&rsquo;re all caught up — nothing needs action right now.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {actionable.map((i) => (
            <Link
              key={i.label}
              href={i.href}
              className={cn(
                "group bg-white border border-border border-l-4 rounded-lg shadow-card p-4 hover:shadow-md transition",
                BORDER[i.accent],
              )}
            >
              <div className="flex items-start justify-between">
                <span className={cn("text-2xl font-bold tabular-nums leading-none", TEXT[i.accent])}>{i.count}</span>
                <ArrowRight className="w-4 h-4 text-inkSoft opacity-0 group-hover:opacity-100 transition" />
              </div>
              <div className="mt-2 text-sm font-semibold text-ink">{i.label}</div>
              {i.hint ? <div className="text-xs text-inkSoft mt-0.5">{i.hint}</div> : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
