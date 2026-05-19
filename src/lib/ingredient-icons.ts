// Hardcoded emoji map per ingredient code. v1 only — Phase 2+ will move this
// to a column on the ingredients table so admins can edit through Settings.

const ICONS: Record<string, string> = {
  APPLE: "🍎",
  CARROT: "🥕",
  CUCUMBER: "🥒",
  GRAPE: "🍇",
  LEMON: "🍋",
  MINT: "🌿",
  PASSIONFRUIT: "🥭",
  PINEAPPLE: "🍍",
  WATERMELON: "🍉",
  WATER: "💧",
  CARRAGEENAN: "🧪",
  COLLAGEN: "💊",
  COCONUT: "🥥",
  GINGER: "🫚",
  LIME: "🍋",
  CAN_PCL: "🥫",
  CAN_ACG: "🥫",
  CAN_WPM: "🥫",
};

export function ingredientEmoji(code: string | null | undefined): string {
  if (!code) return "🥬";
  return ICONS[code.toUpperCase()] ?? "🥬";
}
