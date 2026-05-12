// Shared types for the Settings → Catalog tabs.

export type SkuRow = {
  code: string;
  name: string;
  short_label: string;
  size_ml: number;
  retail_price: number | string;
  is_active: boolean;
};

export type TicketTypeRow = {
  id: string;
  code: string;
  event_category: string;
  name: string;
  price: number | string;
  is_active: boolean;
  notes: string | null;
};

export const POS_PRODUCT_CATEGORIES = ["cup", "water", "merch", "rental", "other"] as const;
export type PosProductCategory = (typeof POS_PRODUCT_CATEGORIES)[number];

export type PosProductRow = {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
  price: number | string;
  category: PosProductCategory | string;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
};

export type PartnerTierRow = {
  code: string;
  name: string;
  price_pcl: number | string;
  price_acg: number | string;
  price_wpm: number | string;
};

export type BundleBreakdown = { PCL?: number; ACG?: number; WPM?: number };

export type PosBundleRow = {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
  price: number | string;
  total_cans: number;
  is_flavor_pickable: boolean;
  fixed_breakdown: BundleBreakdown | null;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
};
