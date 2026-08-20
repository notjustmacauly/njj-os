// Visual identity per flavour, used for placeholder pack art until real
// product photography is added. Keyed by SKU code.
export type FlavorArt = {
  gradient: string; // tailwind gradient classes
  ring: string; // subtle accent (badges, dots)
  emoji: string;
};

const DEFAULT: FlavorArt = {
  gradient: "from-cream to-creamDk",
  ring: "text-inkSoft",
  emoji: "🧃",
};

const BY_SKU: Record<string, FlavorArt> = {
  // Pineapple Cucumber Lemon — bright citrus-green
  PCL: { gradient: "from-[#FBE7A1] to-[#B7D98C]", ring: "text-[#7d8a2e]", emoji: "🍍" },
  // Apple Carrot Grape — warm berry-purple
  ACG: { gradient: "from-[#E7B3C6] to-[#9B6FB0]", ring: "text-[#6f4487]", emoji: "🍇" },
  // Watermelon Passionfruit Mint — cool melon-pink
  WPM: { gradient: "from-[#F7A9B0] to-[#8FD3B6]", ring: "text-[#3f8f6f]", emoji: "🍉" },
};

export function flavorArt(skuCode: string | null | undefined): FlavorArt {
  if (!skuCode) return DEFAULT;
  return BY_SKU[skuCode] ?? DEFAULT;
}
