import { flavorArt } from "./flavor";

export function MixChips({ mix }: { mix: Record<string, number> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(mix)
        .filter(([, n]) => n > 0)
        .map(([code, n]) => {
          const art = flavorArt(code);
          return (
            <span key={code} className="rounded-full bg-cream ring-1 ring-border px-2.5 py-0.5 text-xs font-semibold text-ink/80">
              {n}× {art.emoji} {art.short ?? code}
            </span>
          );
        })}
    </div>
  );
}
