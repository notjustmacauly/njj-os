"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Search, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export type Attendee = {
  id: string;
  external_id: string;
  holder_name: string | null;
  holder_email: string | null;
  holder_user_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  ticket_type_name: string;
  event_sport_id: string | null;
  pass_token: string | null;
  checked_in_at: string | null;
  checked_in_by_name: string | null;
  notes: string | null;
  web_checkout_id: string | null;
};

/** Pass holders for one event, with manual check-in for people without their QR. */
export function Attendees({ rows, paddles }: { rows: Attendee[]; paddles: number }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [linking, setLinking] = React.useState<{ id: string; name: string; email: string } | null>(null);

  async function link() {
    if (!linking || busy) return;
    setBusy(linking.id);
    const { data, error } = await createClient().rpc("staff_link_ticket_holder", { p_ticket: linking.id, p_name: linking.name, p_email: linking.email });
    setBusy(null);
    if (error) return toast.push(error.message, "error");
    toast.push((data as { linked: boolean })?.linked ? "Linked to their account" : "Saved. No account with that email yet, it links when they sign up.", "success");
    setLinking(null);
    router.refresh();
  }

  const visible = rows.filter((r) =>
    `${r.holder_name ?? ""} ${r.holder_email ?? ""} ${r.buyer_name ?? ""} ${r.buyer_email ?? ""} ${r.external_id} ${r.ticket_type_name}`.toLowerCase().includes(q.toLowerCase()),
  );
  const checked = rows.filter((r) => r.checked_in_at).length;

  async function checkIn(r: Attendee) {
    if (!r.pass_token || busy) return;
    setBusy(r.id);
    const { error } = await createClient().rpc("check_in_pass", { p_token: r.pass_token });
    setBusy(null);
    if (error) return toast.push(error.message, "error");
    toast.push(`${r.holder_name ?? "Guest"} checked in`, "success");
    router.refresh();
  }

  return (
    <section className="bg-white border border-border rounded-lg shadow-card">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-border">
        <h3 className="font-semibold text-ink">Attendees</h3>
        <span className="text-sm text-inkSoft">
          {rows.length} passes · {checked} checked in{paddles ? ` · ${paddles} paddle rental${paddles === 1 ? "" : "s"}` : ""}
        </span>
        <div className="ml-auto relative w-56">
          <Search className="w-4 h-4 text-inkSoft absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" className="pl-8" />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-inkSoft text-center">No passes sold yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink truncate flex items-center gap-1.5">
                  {r.holder_name ?? "Guest"}
                  {r.holder_user_id ? (
                    <span title={r.holder_email ?? ""} className="inline-flex items-center gap-0.5 rounded-full bg-greenBg px-1.5 text-[10px] font-semibold text-green">
                      <UserCheck className="w-3 h-3" /> account
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-inkSoft truncate">
                  {r.ticket_type_name} · <span className="font-mono">{r.external_id}</span>
                  {r.buyer_name && r.holder_name && r.buyer_name !== r.holder_name ? ` · booked by ${r.buyer_name}` : ""}
                  {r.notes?.includes("(unverified)") ? " · payment unverified" : ""}
                </div>
                {linking?.id === r.id ? (
                  <form
                    className="mt-2 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      link();
                    }}
                  >
                    <Input value={linking.name} onChange={(e) => setLinking({ ...linking, name: e.target.value })} placeholder="Player name" className="h-8 w-40 text-xs" />
                    <Input value={linking.email} onChange={(e) => setLinking({ ...linking, email: e.target.value })} placeholder="Their account email" className="h-8 w-52 text-xs" />
                    <button type="submit" disabled={busy === r.id} className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      Save
                    </button>
                    <button type="button" onClick={() => setLinking(null)} className="text-xs text-inkSoft hover:text-ink">
                      Cancel
                    </button>
                  </form>
                ) : null}
              </div>
              {!r.holder_user_id && linking?.id !== r.id ? (
                <button
                  type="button"
                  title="Link this pass to the player's account"
                  onClick={() => setLinking({ id: r.id, name: r.holder_name ?? "", email: r.holder_email ?? "" })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-inkSoft hover:bg-cream hover:text-ink"
                >
                  <Link2 className="w-3.5 h-3.5" /> Link
                </button>
              ) : null}
              {r.checked_in_at ? (
                <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {new Date(r.checked_in_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}
                  {r.checked_in_by_name ? ` · ${r.checked_in_by_name}` : ""}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => checkIn(r)}
                  disabled={busy === r.id}
                  className="rounded-md ring-1 ring-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream disabled:opacity-50"
                >
                  Check in
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
