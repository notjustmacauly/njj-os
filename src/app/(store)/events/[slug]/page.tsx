import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fmtEventDate, timeRange, type PublicEvent } from "../../_components/events";
import { ArrowLeftLine, CalendarBlank, ClockLine, MapPinLine } from "../../_components/icons";
import { Bezel, Container } from "../../_components/ui";
import { PassPicker } from "./pass-picker";

export const dynamic = "force-dynamic";

async function getEvent(slug: string): Promise<PublicEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("web_events").select("*").eq("slug", slug).maybeSingle();
  return (data ?? null) as PublicEvent | null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const e = await getEvent(params.slug);
  if (!e) return { title: "Event not found" };
  return {
    title: e.name,
    description: `${e.name}, ${fmtEventDate(e.event_date)}${e.venue_name ? ` at ${e.venue_name}` : ""}. ₱250 per pass.`,
    openGraph: e.cover_image_url ? { images: [e.cover_image_url] } : undefined,
  };
}

export default async function EventPage({ params }: { params: { slug: string } }) {
  const e = await getEvent(params.slug);
  if (!e) notFound();

  return (
    <Container className="pt-8 md:pt-12">
      <Link href="/events" className="inline-flex items-center gap-2 text-sm font-semibold text-s-muted hover:text-s-fg transition">
        <ArrowLeftLine className="w-4 h-4" /> All events
      </Link>

      {e.cover_image_url ? (
        <Bezel className="mt-6">
          <div className="relative aspect-[16/10] md:aspect-[21/9] bg-s-sunken">
            <Image src={e.cover_image_url} alt={e.name} fill priority sizes="(max-width: 1320px) 96vw, 1280px" className="object-cover" />
          </div>
        </Bezel>
      ) : (
        // No cover photo yet: a short brand banner with the date instead of an empty frame.
        <div className="mt-6 rounded-[32px] bg-gradient-to-br from-s-brand/40 to-s-brand/10 px-8 py-10 md:px-12 md:py-12 flex items-end gap-5">
          <span className="font-display font-semibold tracking-[-0.05em] leading-none text-8xl md:text-9xl text-s-fg tabular-nums">
            {new Date(`${e.event_date}T00:00:00Z`).getUTCDate()}
          </span>
          <span className="pb-2 font-display text-2xl md:text-3xl font-semibold text-s-fg/70 leading-tight">
            {new Date(`${e.event_date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" })}
            <br />
            {new Date(`${e.event_date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "long", timeZone: "UTC" })}
          </span>
        </div>
      )}

      <div className="mt-10 grid gap-10 md:grid-cols-12 md:items-start">
        <div className="md:col-span-7">
          <h1 className="font-display font-semibold tracking-[-0.04em] leading-[0.98] text-5xl md:text-6xl text-s-fg [text-wrap:balance]">
            {e.name}
          </h1>

          <ul className="mt-8 grid gap-4 text-s-fg">
            <li className="flex items-center gap-3">
              <CalendarBlank className="w-5 h-5 text-s-muted shrink-0" />
              {fmtEventDate(e.event_date)}
            </li>
            {timeRange(e) ? (
              <li className="flex items-center gap-3">
                <ClockLine className="w-5 h-5 text-s-muted shrink-0" />
                {timeRange(e)}
              </li>
            ) : null}
            {e.venue_name ? (
              <li className="flex items-start gap-3">
                <MapPinLine className="w-5 h-5 text-s-muted shrink-0 mt-0.5" />
                <span>
                  {e.venue_name}
                  {e.venue_address ? <span className="text-s-muted">, {e.venue_address}</span> : null}
                  {e.maps_url ? (
                    <a
                      href={e.maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block mt-1 text-sm font-semibold text-s-fg underline underline-offset-4 decoration-s-line/30 hover:decoration-s-fg"
                    >
                      Open in Maps
                    </a>
                  ) : null}
                </span>
              </li>
            ) : null}
          </ul>

          {e.description ? (
            <div className="mt-10 border-t border-s-line/[0.08] pt-8 text-lg text-s-muted leading-relaxed whitespace-pre-line max-w-[60ch]">
              {e.description}
            </div>
          ) : null}
        </div>

        <div className="md:col-span-5 md:sticky md:top-28">
          <PassPicker event={e} />
        </div>
      </div>
    </Container>
  );
}
