import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "../_components/event-card";
import type { PublicEvent } from "../_components/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Community games and events by NotJust — pickleball, badminton and more. ₱250 per pass.",
};

export default async function EventsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("web_events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });
  const events = (data ?? []) as PublicEvent[];

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink">Events</h1>
        <p className="text-inkSoft mt-2">
          Show up, play, meet the community. Every pass is ₱250 for one sport — grab yours before the spots run out.
        </p>
      </header>

      {events.length === 0 ? (
        <div className="rounded-3xl bg-white ring-1 ring-border p-10 text-center text-inkSoft">
          New events are coming soon — check back shortly.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
