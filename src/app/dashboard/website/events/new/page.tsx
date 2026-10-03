import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventEditor } from "../event-editor";
import { loadEditorContext } from "../load";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const supabase = await createClient();
  const { venues, templates } = await loadEditorContext(supabase);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  return (
    <div className="space-y-4">
      <Link href="/dashboard/website/events" className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink">
        <ArrowLeft className="w-4 h-4" /> All events
      </Link>
      <h2 className="font-serif font-bold text-2xl text-ink">New event</h2>
      <EventEditor
        venues={venues}
        seriesTemplates={templates}
        initial={{
          series: "",
          name: "",
          description: "",
          cover_image_url: null,
          event_date: tomorrow,
          start_time: "",
          end_time: "",
          venue_id: "",
          pass_price: 250,
          paddle_price: 50,
          status: "published",
          sports: [{ name: "Pickleball", capacity: 24 }],
        }}
      />
    </div>
  );
}
