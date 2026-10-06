// Public event shape (web_events view) + display helpers.
export type EventSport = { id: string; name: string; capacity: number; left: number };

export type PublicEvent = {
  id: string;
  slug: string;
  name: string;
  series: string | null;
  description: string | null;
  cover_image_url: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  pass_price: number | string;
  paddle_price: number | string | null;
  venue_name: string | null;
  venue_address: string | null;
  maps_url: string | null;
  sports: EventSport[];
};

export function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function timeRange(e: { start_time: string | null; end_time: string | null }): string {
  if (!e.start_time) return "";
  return e.end_time ? `${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}` : fmtTime(e.start_time);
}

export function fmtEventDate(iso: string, style: "long" | "short" = "long"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", {
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    ...(style === "long" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function spotsLeft(e: PublicEvent): number {
  return e.sports.reduce((a, s) => a + s.left, 0);
}
