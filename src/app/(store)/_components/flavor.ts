// Visual identity per flavour, used for placeholder pack art until real
// product photography is added. Keyed by SKU code.
export type FlavorArt = {
  gradient: string; // tailwind gradient classes
  ring: string; // subtle accent (badges, dots)
  emoji: string;
  short?: string; // shopper-facing flavour name ("Pineapple")
  preset?: string; // name of the all-this-flavour quick pick
  can?: string; // transparent can cutout
};

const DEFAULT: FlavorArt = {
  gradient: "from-cream to-creamDk",
  ring: "text-inkSoft",
  emoji: "🧃",
};

const BY_SKU: Record<string, FlavorArt> = {
  // Pineapple Cucumber Lemon — bright citrus-green
  PCL: { gradient: "from-[#FBE7A1] to-[#B7D98C]", ring: "text-[#7d8a2e]", emoji: "🍍", short: "Pineapple", preset: "The Glow", can: "/can-pcl.png" },
  // Apple Carrot Grape — warm berry-purple
  ACG: { gradient: "from-[#E7B3C6] to-[#9B6FB0]", ring: "text-[#6f4487]", emoji: "🍇", short: "Apple", preset: "The Radiance", can: "/can-acg.png" },
  // Watermelon Passionfruit Mint — cool melon-pink
  WPM: { gradient: "from-[#F7A9B0] to-[#8FD3B6]", ring: "text-[#3f8f6f]", emoji: "🍉", short: "Watermelon", preset: "The Refresh", can: "/can-wpm.png" },
};

export function flavorArt(skuCode: string | null | undefined): FlavorArt {
  if (!skuCode) return DEFAULT;
  return BY_SKU[skuCode] ?? DEFAULT;
}

// Mixed packs (no single SKU) — a blend of all three flavour colours.
export const MIX_GRADIENT = "from-[#FBE7A1] via-[#F7A9B0] to-[#9B6FB0]";
export const MIX_CANS = ["/can-pcl.png", "/can-acg.png", "/can-wpm.png"];
