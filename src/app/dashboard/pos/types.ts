// Shared types for the POS module.

export type PosItemType = "juice" | "cup_sm" | "cup_lg" | "water" | "ticket" | "other";

export type CartItem = {
  // Local React key — stable across re-renders.
  id: string;
  item_type: PosItemType;
  // For juice items.
  sku_code?: "PCL" | "ACG" | "WPM";
  batch_id?: string;
  // For ticket items.
  ticket_type_code?: string;
  // Display + payload label (e.g. "PCL", "Cup Large", "Saturday Yoga").
  label: string;
  emoji?: string;
  qty: number;
  unit_price: number;
  // Free-form note persisted on pos_transaction_items.notes — used to tag
  // bundle-expanded rows ("From bundle BUNDLE_4PK").
  notes?: string;
};

export type SkuRef = {
  code: string;
  name: string;
  short_label: string | null;
  retail_price: number | string | null;
};

export type BatchOption = {
  batch_id: string;
  external_id: string;
  remaining: number;
  sku_code: string;
};

export type TicketTypeRef = {
  code: string;
  event_category: string;
  name: string;
  price: number | string;
};

export type PosProductRef = {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
  price: number | string;
  category: string;
  sort_order: number;
};

export type PosBundleRef = {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
  price: number | string;
  total_cans: number;
  is_flavor_pickable: boolean;
  fixed_breakdown: { PCL?: number; ACG?: number; WPM?: number } | null;
  sort_order: number;
};

export type ActiveShift = {
  id: string;
  external_id: string | null;
  event_name: string | null;
  opened_at: string;
  opening_cash: number | string;
  staff_name: string | null;
  staff_user_id: string | null;
  default_batch_pcl: string | null;
  default_batch_acg: string | null;
  default_batch_wpm: string | null;
};

export type { Role } from "@/lib/roles";
