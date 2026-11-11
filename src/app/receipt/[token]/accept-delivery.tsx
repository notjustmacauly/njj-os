"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function AcceptDelivery({
  token,
  initialName,
  initialAt,
}: {
  token: string;
  initialName: string | null;
  initialAt: string | null;
}) {
  const [name, setName] = React.useState("");
  const [acceptedName, setAcceptedName] = React.useState(initialName);
  const [acceptedAt, setAcceptedAt] = React.useState(initialAt);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  if (acceptedAt) {
    return (
      <div className="bg-greenBg border border-green/30 rounded-md p-3 text-xs text-ink">
        <div className="font-semibold text-green">✓ Delivery accepted</div>
        <div className="mt-0.5">Received by <span className="font-semibold">{acceptedName}</span></div>
        <div className="text-inkSoft">{fmt(acceptedAt)}</div>
      </div>
    );
  }

  async function submit() {
    const n = name.trim();
    if (!n) { setErr("Please enter your name."); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("accept_delivery", { p_token: token, p_name: n });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't record. Try again."); return; }
    const d = data as { received_by_name: string; received_at: string };
    setAcceptedName(d.received_by_name);
    setAcceptedAt(d.received_at);
  }

  return (
    <div className="bg-white border border-berry/40 rounded-md p-3 text-xs">
      <div className="font-semibold text-ink mb-1">Accept delivery</div>
      <div className="text-inkSoft mb-2">
        Enter your name to confirm you received this delivery. The date &amp; time are recorded automatically.
      </div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          disabled={busy}
          className="flex-1 h-9 rounded-md border border-border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-berry px-3 py-1.5 text-sm font-semibold text-white hover:bg-berry/90 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "…" : "Confirm receipt"}
        </button>
      </div>
      {err ? <div className="text-coral mt-1">{err}</div> : null}
    </div>
  );
}
