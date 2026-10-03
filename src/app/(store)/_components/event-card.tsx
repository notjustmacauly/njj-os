import Link from "next/link";
import Image from "next/image";
import { Clock, MapPin } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import { fmtEventDate, spotsLeft, timeRange, type PublicEvent } from "./events";

export function EventCard({ event }: { event: PublicEvent }) {
  const left = spotsLeft(event);
  const soldOut = event.sports.length > 0 && left <= 0;
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block rounded-2xl border border-border bg-white overflow-hidden shadow-card hover:shadow-lg transition"
    >
      <div className="relative aspect-[16/10] bg-gradient-to-br from-salmonBg to-berryBg">
        {event.cover_image_url ? (
          <Image
            src={event.cover_image_url}
            alt={event.name}
            fill
            sizes="(max-width: 640px) 90vw, 380px"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl" aria-hidden>
            🏓
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-white/95 text-ink text-xs font-bold px-3 py-1">
          {fmtEventDate(event.event_date, "short")}
        </span>
        {soldOut ? (
          <span className="absolute top-3 right-3 rounded-full bg-ink/80 text-white text-xs font-semibold px-2.5 py-1">
            Sold out
          </span>
        ) : null}
      </div>
      <div className="p-4 space-y-1.5">
        {event.series && event.series !== event.name ? (
          <div className="text-[11px] uppercase tracking-smallcaps font-semibold text-berry">{event.series}</div>
        ) : null}
        <h3 className="font-display font-semibold text-ink text-lg leading-tight group-hover:text-berry transition">
          {event.name}
        </h3>
        {timeRange(event) ? (
          <p className="flex items-center gap-1.5 text-sm text-inkSoft">
            <Clock className="w-3.5 h-3.5" /> {timeRange(event)}
          </p>
        ) : null}
        {event.venue_name ? (
          <p className="flex items-center gap-1.5 text-sm text-inkSoft">
            <MapPin className="w-3.5 h-3.5" /> {event.venue_name}
          </p>
        ) : null}
        <div className="flex items-baseline justify-between pt-1.5">
          <span className="font-semibold text-ink tabular-nums">{formatPHP(event.pass_price)}</span>
          <span className={`text-xs font-semibold ${soldOut ? "text-inkSoft" : left <= 8 ? "text-coral" : "text-inkSoft"}`}>
            {soldOut ? "Sold out" : event.sports.length > 1 ? event.sports.map((s) => s.name).join(" · ") : `${left} spots left`}
          </span>
        </div>
      </div>
    </Link>
  );
}
