import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "../_components/event-card";
import type { PublicEvent } from "../_components/events";
import { Reveal } from "../_components/reveal";
import { Container, Lede } from "../_components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Community games and events by NotJust. Pickleball, badminton and more, ₱250 per pass.",
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
    <Container className="pt-14 md:pt-20">
      <Reveal className="max-w-2xl">
        <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg">Events</h1>
        <Lede className="mt-5">Show up, play, meet the community. Every pass is ₱250 for one sport.</Lede>
      </Reveal>

      {events.length === 0 ? (
        <Reveal delay={120} className="mt-12">
          <div className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] px-8 py-16 text-center">
            <p className="font-display text-2xl font-semibold text-s-fg">New dates coming soon.</p>
            <p className="mt-2 text-s-muted">Check back shortly for the next games.</p>
          </div>
        </Reveal>
      ) : (
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e, i) => (
            <Reveal as="li" key={e.id} delay={Math.min(i, 5) * 60}>
              <EventCard event={e} />
            </Reveal>
          ))}
        </ul>
      )}
    </Container>
  );
}
