import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtEventDate, timeRange, type PublicEvent } from "../../_components/events";
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
    description: `${e.name} — ${fmtEventDate(e.event_date)}${e.venue_name ? ` at ${e.venue_name}` : ""}. ₱250 per pass.`,
    openGraph: e.cover_image_url ? { images: [e.cover_image_url] } : undefined,
  };
}

export default async function EventPage({ params }: { params: { slug: string } }) {
  const e = await getEvent(params.slug);
  if (!e) notFound();

  return (
    <div className="pb-16">
      {/* Main image */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[520px] bg-gradient-to-br from-salmonBg to-berryBg">
        {e.cover_image_url ? (
          <Image src={e.cover_image_url} alt={e.name} fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-7xl" aria-hidden>
            🏓
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4">
        <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mt-6">
          <ArrowLeft className="w-4 h-4" />
          All events
        </Link>

        <div className="mt-4 grid gap-8 md:grid-cols-[1fr_340px] md:items-start">
          <div>
            {e.series && e.series !== e.name ? (
              <div className="text-xs uppercase tracking-smallcaps font-semibold text-berry">{e.series}</div>
            ) : null}
            <h1 className="font-display text-3xl sm:text-5xl font-semibold text-ink leading-tight mt-1">{e.name}</h1>

            <ul className="mt-5 space-y-2.5 text-ink">
              <li className="flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-berry shrink-0" />
                {fmtEventDate(e.event_date)}
              </li>
              {timeRange(e) ? (
                <li className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-berry shrink-0" />
                  {timeRange(e)}
                </li>
              ) : null}
              {e.venue_name ? (
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-berry shrink-0 mt-0.5" />
                  <span>
                    {e.venue_name}
                    {e.venue_address ? <span className="text-inkSoft"> · {e.venue_address}</span> : null}
                    {e.maps_url ? (
                      <>
                        {" "}
                        <a href={e.maps_url} target="_blank" rel="noreferrer" className="text-berry font-semibold hover:underline">
                          Open in Maps
                        </a>
                      </>
                    ) : null}
                  </span>
                </li>
              ) : null}
            </ul>

            {e.description ? (
              <div className="mt-8 text-ink/85 leading-relaxed whitespace-pre-line">{e.description}</div>
            ) : null}
          </div>

          <PassPicker event={e} />
        </div>
      </div>
    </div>
  );
}
