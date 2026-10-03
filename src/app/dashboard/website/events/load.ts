import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventDraft, Venue } from "./event-editor";

type EventRow = {
  id: string;
  slug: string | null;
  series: string | null;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  venue_id: string | null;
  pass_price: number | string;
  paddle_price: number | string | null;
  status: EventDraft["status"];
  event_sports: Array<{ id: string; name: string; capacity: number; sort_order: number }>;
};

export const EVENT_SELECT =
  "id, slug, series, name, description, cover_image_url, event_date, start_time, end_time, venue_id, pass_price, paddle_price, status, event_sports(id, name, capacity, sort_order)";

export function toDraft(e: EventRow, sold: Record<string, number> = {}): EventDraft {
  return {
    id: e.id,
    slug: e.slug ?? undefined,
    series: e.series ?? "",
    name: e.name,
    description: e.description ?? "",
    cover_image_url: e.cover_image_url,
    event_date: e.event_date,
    start_time: e.start_time?.slice(0, 5) ?? "",
    end_time: e.end_time?.slice(0, 5) ?? "",
    venue_id: e.venue_id ?? "",
    pass_price: Number(e.pass_price),
    paddle_price: e.paddle_price == null ? null : Number(e.paddle_price),
    status: e.status,
    sports: [...e.event_sports]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, sold: sold[s.id] ?? 0 })),
  };
}

// The series Mac already runs — offered even before their first website event.
const KNOWN_SERIES = ["Total Tuesday", "Rise and Pickle", "Rally and Rank"];

export async function loadEditorContext(supabase: SupabaseClient) {
  const [{ data: venues }, { data: recent }] = await Promise.all([
    supabase.from("venues").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("events")
      .select(EVENT_SELECT)
      .is("deleted_at", null)
      .not("series", "is", null)
      .order("event_date", { ascending: false })
      .limit(200),
  ]);
  const templates: Record<string, Omit<EventDraft, "event_date" | "status">> = {};
  for (const e of (recent ?? []) as unknown as EventRow[]) {
    if (!e.series || templates[e.series]) continue;
    const { event_date: _d, status: _s, id: _i, slug: _sl, ...rest } = toDraft(e);
    void _d; void _s; void _i; void _sl;
    templates[e.series] = { ...rest, sports: rest.sports.map((s) => ({ name: s.name, capacity: s.capacity })) };
  }
  for (const name of KNOWN_SERIES) {
    templates[name] ??= {
      series: name,
      name,
      description: "",
      cover_image_url: null,
      start_time: "",
      end_time: "",
      venue_id: "",
      pass_price: 250,
      paddle_price: 50,
      sports: [],
    };
  }
  return { venues: (venues ?? []) as Venue[], templates };
}
