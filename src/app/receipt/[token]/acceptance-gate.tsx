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

// Gates the receipt behind an acceptance step for the RECEIVER (anon scan):
// the order details are blurred until they enter their name and accept. Staff
// opening it from the OS (requireAccept=false) see it directly to print.
export function AcceptanceGate({
  token,
  orderId,
  initialName,
  initialAt,
  requireAccept,
  children,
}: {
  token: string;
  orderId: string | null;
  initialName: string | null;
  initialAt: string | null;
  requireAccept: boolean;
  children: React.ReactNode;
}) {
  const [name, setName] = React.useState("");
  const [acceptedName, setAcceptedName] = React.useState(initialName);
  const [acceptedAt, setAcceptedAt] = React.useState(initialAt);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const gated = requireAccept && !acceptedAt;

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
    <>
      {/* Confirmation banner — stays on the page after acceptance. */}
      {acceptedAt ? (
        <div className="print:hidden mx-auto w-[105mm] max-w-full mb-3">
          <div className="bg-greenBg border border-green/30 rounded-md p-3 text-sm">
            <div className="font-semibold text-green">✓ Delivery accepted</div>
            <div className="text-ink mt-0.5">Received by <span className="font-semibold">{acceptedName}</span></div>
            <div className="text-inkSoft text-xs">{fmt(acceptedAt)}</div>
          </div>
        </div>
      ) : null}

      <div className={gated ? "blur-[6px] pointer-events-none select-none" : ""} aria-hidden={gated}>
        {children}
      </div>

      {/* Acceptance gate overlay (receiver only, until accepted). */}
      {gated ? (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-card max-w-sm w-full p-6">
            <div className="text-[11px] uppercase tracking-smallcaps font-semibold text-inkSoft">Delivery</div>
            {orderId ? <div className="font-mono font-bold text-ink">{orderId}</div> : null}
            <h1 className="font-serif font-bold text-2xl text-ink mt-2">Accept this delivery</h1>
            <p className="text-sm text-inkSoft mt-1">
              Enter your name to confirm you received this order. The date &amp; time are recorded automatically.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              disabled={busy}
              autoFocus
              className="mt-4 w-full h-11 rounded-lg border border-border px-3 text-base focus:outline-none focus:ring-2 focus:ring-berry/30 focus:border-berry"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="mt-3 w-full rounded-lg bg-berry px-4 py-3 text-sm font-bold text-white hover:bg-berry/90 disabled:opacity-50"
            >
              {busy ? "Recording…" : "Accept delivery"}
            </button>
            {err ? <div className="text-coral text-xs mt-2">{err}</div> : null}
            <p className="text-[11px] text-inkSoft mt-3 text-center">Order details appear once you accept.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
