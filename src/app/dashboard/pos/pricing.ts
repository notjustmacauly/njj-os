// Static constants for the POS module. Item catalog (cups, water, etc.) now
// lives in the `pos_products` table — fetched server-side and passed to the
// client. See SETTINGS_CATALOG_MODULE.md §6.

export const SKU_EMOJI: Record<string, string> = {
  PCL: "🍍",
  ACG: "🥕",
  WPM: "🍉",
};

export const PAYMENT_METHODS = ["Cash", "GCash", "Bank Transfer", "Xendit", "Other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
