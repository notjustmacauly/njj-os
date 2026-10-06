import Link from "next/link";
import Image from "next/image";
import { CalendarBlank, MapPinLine } from "./icons";
import { formatPHP } from "@/lib/utils";
import { fmtEventDate, spotsLeft, timeRange, type PublicEvent } from "./events";
import { Bezel } from "./ui";

/** Event tile: cover photo first, the facts underneath. */
export function EventCard({ event }: { event: PublicEvent }) {
  const left = spotsLeft(event);
  const soldOut = event.sports.length > 0 && left <= 0;
  // Only list sports when they add information beyond the title.
  const sports = event.sports
    .map((s) => s.name)
    .filter((n) => n.toLowerCase() !== event.name.toLowerCase())
    .join(", ");
  return (
    <Link href={`/events/${event.slug}`} className="group block h-full">
      <Bezel className="h-full transition duration-500 ease-settle group-hover:-translate-y-1" innerClassName="h-full flex flex-col">
        <div className="relative aspect-[4/3] bg-s-sunken">
          {event.cover_image_url ? (
            <Image
              src={event.cover_image_url}
              alt={event.name}
              fill
              sizes="(max-width: 640px) 85vw, 400px"
              className="object-cover transition duration-700 ease-settle group-hover:scale-[1.03]"
            />
          ) : (
            // No cover yet: the date becomes the artwork.
            <div className="absolute inset-0 flex flex-col justify-end p-6 bg-gradient-to-br from-s-brand/35 to-s-brand/10">
              <span className="font-display font-semibold tracking-[-0.05em] leading-none text-7xl text-s-fg tabular-nums">
                {new Date(`${event.event_date}T00:00:00Z`).getUTCDate()}
              </span>
              <span className="mt-1 font-display text-xl font-semibold text-s-fg/70">
                {new Date(`${event.event_date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" })}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-3 px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-s-fg">{fmtEventDate(event.event_date, "short")}</p>
            <h3 className="font-display text-2xl font-semibold tracking-[-0.02em] text-s-fg mt-1 leading-tight">{event.name}</h3>
          </div>
          <div className="grid gap-1.5 text-sm text-s-muted">
            {timeRange(event) ? (
              <span className="flex items-center gap-2">
                <CalendarBlank className="w-4 h-4" /> {timeRange(event)}
              </span>
            ) : null}
            {event.venue_name ? (
              <span className="flex items-center gap-2">
                <MapPinLine className="w-4 h-4" /> {event.venue_name}
              </span>
            ) : null}
          </div>
          <div className="mt-auto flex items-baseline justify-between gap-3 pt-2">
            <span className="font-semibold tabular-nums text-s-fg">{formatPHP(event.pass_price)}</span>
            <span className="text-xs text-s-muted text-right">
              {soldOut ? "Sold out" : left <= 8 || !sports ? `${left} spots left` : sports}
            </span>
          </div>
        </div>
      </Bezel>
    </Link>
  );
}
