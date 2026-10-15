import { Feather, Shield, Swords, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Per-format look for Game Day cards: a court-colour surface and a coin-style
 * token (ridged rim via conic gradient, glossy face, format glyph).
 */
export const FORMAT_THEME: Record<
  string,
  { surface: string; rimA: string; rimB: string; face: string; ink: string; Icon: LucideIcon; mark?: string }
> = {
  classic: { surface: "#2F7A4B", rimA: "#F2C14E", rimB: "#C9962A", face: "#FFF4D6", ink: "#2F7A4B", Icon: Feather },
  team: { surface: "#25588A", rimA: "#E6EDF5", rimB: "#AFC0D3", face: "#FFFFFF", ink: "#25588A", Icon: Shield, mark: "ABC" },
  double: { surface: "#B4471D", rimA: "#FFD27A", rimB: "#E09A32", face: "#FFF1D9", ink: "#B4471D", Icon: Zap, mark: "x2" },
  rivalry: { surface: "#2A2D3A", rimA: "#E8A0B4", rimB: "#B8657E", face: "#FCEFF3", ink: "#8E2F4E", Icon: Swords },
  casual: { surface: "#5B6170", rimA: "#E5E7EB", rimB: "#B8BDC7", face: "#FFFFFF", ink: "#5B6170", Icon: Feather },
};

export function GameToken({ format, size = 96, className }: { format: string; size?: number; className?: string }) {
  const t = FORMAT_THEME[format] ?? FORMAT_THEME.casual;
  const { Icon } = t;
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        // Ridged coin edge.
        background: `repeating-conic-gradient(${t.rimA} 0deg 7deg, ${t.rimB} 7deg 14deg)`,
        boxShadow: "0 10px 24px rgba(15, 20, 30, 0.28), inset 0 0 0 2px rgba(255,255,255,0.35)",
      }}
    >
      <span
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size * 0.78,
          height: size * 0.78,
          background: `radial-gradient(circle at 32% 26%, #ffffff 0%, ${t.face} 42%, ${t.rimA} 100%)`,
          boxShadow: `inset 0 2px 0 rgba(255,255,255,0.9), inset 0 -3px 6px rgba(0,0,0,0.12), 0 0 0 2px ${t.rimB}`,
        }}
      >
        <span className="absolute inset-[9%] rounded-full border border-dashed" style={{ borderColor: `${t.ink}40` }} />
        <Icon style={{ width: size * 0.36, height: size * 0.36, color: t.ink }} strokeWidth={2} />
        {t.mark ? (
          <span
            className="absolute bottom-[14%] rounded-full px-1.5 font-bold leading-4 text-white tabular-nums"
            style={{ background: t.ink, fontSize: Math.max(9, size * 0.11) }}
          >
            {t.mark}
          </span>
        ) : null}
      </span>
    </span>
  );
}
