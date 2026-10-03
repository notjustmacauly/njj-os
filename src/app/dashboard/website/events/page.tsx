import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  series: string | null;
  event_date: string;
  start_time: string | null;
  status: "draft" | "published" | "closed";
  pass_price: number | string;
  cover_image_url: string | null;
  venues: { name: string } | null;
  event_sports: Array<{ id: string; name: string; capacity: number }>;
};

function fmt(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function WebsiteEventsPage({ searchParams }: { searchParams: { view?: string } }) {
  const view = searchParams.view === "past" ? "past" : "upcoming";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const supabase = await createClient();
  let q = supabase
    .from("events")
    .select("id, name, series, event_date, start_time, status, pass_price, cover_image_url, venues(name), event_sports(id, name, capacity)")
    .is("deleted_at", null);
  q = view === "past" ? q.lt("event_date", today).order("event_date", { ascending: false }) : q.gte("event_date", today).order("event_date");
  const { data } = await q.limit(100);
  const rows = (data ?? []) as unknown as Row[];

  // Passes sold per event (online + door), from tickets.
  const ids = rows.map((r) => r.id);
  const sold: Record<string, { sold: number; checkedIn: number }> = {};
  if (ids.length) {
    const { data: t } = await supabase
      .from("tickets")
      .select("event_id, checked_in_at, pass_token")
      .in("event_id", ids)
      .is("deleted_at", null)
      .not("pass_token", "is", null);
    for (const x of (t ?? []) as Array<{ event_id: string; checked_in_at: string | null }>) {
      const s = (sold[x.event_id] ??= { sold: 0, checkedIn: 0 });
      s.sold++;
      if (x.checked_in_at) s.checkedIn++;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["upcoming", "past"] as const).map((v) => (
          <Link
            key={v}
            href={`/dashboard/website/events${v === "past" ? "?view=past" : ""}`}
            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition ${
              view === v ? "bg-berry text-white" : "bg-white ring-1 ring-border text-inkSoft hover:text-ink"
            }`}
          >
            {v === "upcoming" ? "Upcoming" : "Past"}
          </Link>
        ))}
        <Link
          href="/dashboard/website/events/new"
          className="ml-auto inline-flex items-center gap-1.5 bg-berry text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-berry/90"
        >
          <Plus className="w-4 h-4" /> New event
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card px-5 py-10 text-center text-sm text-inkSoft">
          {view === "upcoming" ? "No upcoming events. Create one — or a weekly series — with New event." : "No past events yet."}
        </div>
      ) : (
        <ul className="bg-white border border-border rounded-lg shadow-card divide-y divide-border">
          {rows.map((r) => {
            const cap = r.event_sports.reduce((a, s) => a + s.capacity, 0);
            const s = sold[r.id] ?? { sold: 0, checkedIn: 0 };
            return (
              <li key={r.id}>
                <Link href={`/dashboard/website/events/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-cream/60">
                  <div className="w-16 h-12 rounded-md bg-cream overflow-hidden shrink-0">
                    {r.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.cover_image_url} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink truncate">{r.name}</span>
                      {r.status !== "published" ? (
                        <span className="text-[10px] uppercase tracking-smallcaps font-semibold rounded-full bg-ink/5 text-inkSoft px-2 py-0.5">
                          {r.status}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-inkSoft">
                      {fmt(r.event_date)}
                      {r.venues?.name ? ` · ${r.venues.name}` : ""}
                      {r.event_sports.length ? ` · ${r.event_sports.map((x) => x.name).join(", ")}` : " · no sports yet"}
                    </div>
                  </div>
                  <div className="text-right text-sm shrink-0">
                    <div className="font-semibold text-ink tabular-nums">
                      {s.sold} / {cap}
                    </div>
                    <div className="text-xs text-inkSoft">
                      {view === "past" ? `${s.checkedIn} checked in` : `passes · ${formatPHP(r.pass_price)}`}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
