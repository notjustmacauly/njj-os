import { flavorArt } from "./flavor";

export function MixChips({ mix }: { mix: Record<string, number> }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(mix)
        .filter(([, n]) => n > 0)
        .map(([code, n]) => (
          <span key={code} className="rounded-full bg-s-sunken px-3 py-1 text-xs font-semibold text-s-fg/80 tabular-nums">
            {n} {flavorArt(code).short ?? code}
          </span>
        ))}
    </div>
  );
}
