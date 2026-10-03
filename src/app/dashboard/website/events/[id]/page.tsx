import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventEditor } from "../event-editor";
import { EVENT_SELECT, loadEditorContext, toDraft } from "../load";
import { Attendees, type Attendee } from "./attendees";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const [{ data: ev }, ctx, { data: tix }] = await Promise.all([
    supabase.from("events").select(EVENT_SELECT).eq("id", params.id).is("deleted_at", null).maybeSingle(),
    loadEditorContext(supabase),
    supabase
      .from("tickets")
      .select("id, external_id, holder_name, buyer_email, ticket_type_name, event_sport_id, pass_token, checked_in_at, checked_in_by_name, notes, web_checkout_id")
      .eq("event_id", params.id)
      .is("deleted_at", null)
      .order("created_at"),
  ]);
  if (!ev) notFound();

  const attendees = ((tix ?? []) as Attendee[]).filter((t) => t.pass_token);
  const paddles = ((tix ?? []) as Attendee[]).filter((t) => !t.pass_token).length;
  const sold: Record<string, number> = {};
  for (const t of attendees) if (t.event_sport_id) sold[t.event_sport_id] = (sold[t.event_sport_id] ?? 0) + 1;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/website/events" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink">
        <ArrowLeft className="w-4 h-4" /> All events
      </Link>
      <EventEditor initial={toDraft(ev as never, sold)} venues={ctx.venues} seriesTemplates={ctx.templates} />
      <Attendees rows={attendees} paddles={paddles} />
    </div>
  );
}
