import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { PublicEvent } from "../../../_components/events";
import { PassCheckout, type PassLine } from "./pass-checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get passes", robots: { index: false } };

export default async function PassCheckoutPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { s?: string | string[]; paddles?: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase.from("web_events").select("*").eq("slug", params.slug).maybeSingle();
  const event = (data ?? null) as PublicEvent | null;
  if (!event) notFound();

  // ?s=<sportId>:<qty>&s=… — clamp to what's actually left.
  const raw = Array.isArray(searchParams.s) ? searchParams.s : searchParams.s ? [searchParams.s] : [];
  const lines: PassLine[] = [];
  for (const entry of raw) {
    const [id, n] = entry.split(":");
    const sport = event.sports.find((s) => s.id === id);
    const qty = Math.min(Math.max(parseInt(n ?? "0", 10) || 0, 0), sport?.left ?? 0, 10);
    if (sport && qty > 0) lines.push({ sport_id: sport.id, name: sport.name, qty });
  }
  if (!lines.length) redirect(`/events/${event.slug}`);
  const passCount = lines.reduce((a, l) => a + l.qty, 0);
  const paddles = event.paddle_price == null ? 0 : Math.min(Math.max(parseInt(searchParams.paddles ?? "0", 10) || 0, 0), passCount);

  return <PassCheckout event={event} lines={lines} paddles={paddles} />;
}
