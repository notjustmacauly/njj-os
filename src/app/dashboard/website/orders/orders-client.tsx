"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Mail, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatPHP } from "@/lib/utils";

export type WebCheckoutRow = {
  id: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string | null;
  delivery_notes: string | null;
  first_delivery_date: string;
  kind: "shop" | "passes";
  event: { name: string; event_date: string } | null;
  items: Array<{
    name: string;
    price: number;
    cans?: number;
    deliveries?: number;
    mix?: Record<string, number>;
    kind?: "pass" | "paddle";
    qty?: number;
  }>;
  subtotal: number | string;
  delivery_total: number | string;
  total: number | string;
  payment_verification: "unverified" | "verified" | "rejected" | "auto";
  proof_path: string | null;
  proof_url: string | null;
  flags: string[];
  verified_account_code: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  email_sent_at: string | null;
  email_error: string | null;
  orders: Array<{ id: string; external_id: string; delivery_date: string; fulfillment_status: string; total: number | string }>;
};

type Filter = "unverified" | "verified" | "rejected";

const FLAG_LABEL: Record<string, string> = {
  duplicate_screenshot: "Screenshot used before",
  first_time_customer: "First-time customer",
  high_value: "High value",
};
const FLAVOR: Record<string, string> = { PCL: "🍍 Pineapple", ACG: "🍇 Apple", WPM: "🍉 Watermelon" };
const DEFAULT_ACCOUNT = "RCBC Main";

function fmtDate(iso: string) {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    ...(iso.length === 10 ? { timeZone: "UTC" } : { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }),
  });
}

export function WebOrdersClient({
  rows,
  accounts,
}: {
  rows: WebCheckoutRow[];
  accounts: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = React.useState<Filter>("unverified");
  const [rejecting, setRejecting] = React.useState<WebCheckoutRow | null>(null);
  const [zoom, setZoom] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [account, setAccount] = React.useState<Record<string, string>>({});

  const counts = {
    unverified: rows.filter((r) => r.payment_verification === "unverified").length,
    verified: rows.filter((r) => r.payment_verification === "verified").length,
    rejected: rows.filter((r) => r.payment_verification === "rejected").length,
  };
  const visible = rows.filter((r) => r.payment_verification === filter);
  const defaultAccount = accounts.some((a) => a.code === DEFAULT_ACCOUNT) ? DEFAULT_ACCOUNT : accounts[0]?.code ?? "";

  async function resend(r: WebCheckoutRow) {
    if (busy) return;
    setBusy(r.id);
    const res = await fetch("/api/shop/checkout/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; sentTo?: string };
    setBusy(null);
    if (!res.ok) toast.push(json.error ?? "Couldn't send the email.", "error");
    else toast.push(`Confirmation sent to ${json.sentTo}`, "success");
    router.refresh();
  }

  async function review(r: WebCheckoutRow, decision: "verified" | "rejected", note?: string) {
    if (busy) return;
    setBusy(r.id);
    const { error } = await createClient().rpc("web_review_checkout", {
      p_checkout_id: r.id,
      p_decision: decision,
      p_account_code: decision === "verified" ? account[r.id] ?? defaultAccount : null,
      p_note: note ?? null,
    });
    setBusy(null);
    if (error) return toast.push(error.message, "error");
    toast.push(decision === "verified" ? `${r.reference} verified` : `${r.reference} rejected — orders cancelled`, "success");
    setRejecting(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["unverified", "To verify"],
            ["verified", "Verified"],
            ["rejected", "Rejected"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-sm font-semibold transition",
              filter === k ? "bg-berry text-white" : "bg-white ring-1 ring-border text-inkSoft hover:text-ink",
            )}
          >
            {label} <span className="opacity-70">{counts[k]}</span>
          </button>
        ))}
        <p className="ml-auto text-xs text-inkSoft max-w-sm">
          Customers see &ldquo;Payment completed&rdquo; right away. Check each screenshot against the bank, then
          verify (moves the money out of Unverified Receipts) or reject (cancels the orders, frees the stock).
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card px-5 py-10 text-center text-sm text-inkSoft">
          {filter === "unverified" ? "Nothing waiting — all payments are checked. 🎉" : "None yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="bg-white border border-border rounded-lg shadow-card p-4 flex flex-col md:flex-row gap-4">
              <button
                type="button"
                onClick={() => r.proof_url && setZoom(r.proof_url)}
                className="shrink-0 w-full md:w-32 h-40 rounded-md bg-cream overflow-hidden flex items-center justify-center"
                aria-label="View payment screenshot"
              >
                {r.proof_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.proof_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-inkSoft">No image</span>
                )}
              </button>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold text-ink">{r.reference}</span>
                  <span className="text-lg font-bold text-ink tabular-nums">{formatPHP(r.total)}</span>
                  <span className="text-xs text-inkSoft">{fmtDate(r.created_at)}</span>
                </div>
                {r.flags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {r.flags.map((f) => (
                      <span
                        key={f}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          f === "duplicate_screenshot" ? "bg-coral text-white" : "bg-salmonBg text-coral",
                        )}
                      >
                        {f === "duplicate_screenshot" ? <AlertTriangle className="w-3 h-3" /> : null}
                        {FLAG_LABEL[f] ?? f}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="text-sm text-ink">
                  {r.customer_name} · <a href={`tel:${r.customer_phone}`} className="text-berry">{r.customer_phone}</a> ·{" "}
                  <a href={`mailto:${r.customer_email}`} className="text-berry">{r.customer_email}</a>
                </div>
                <div className="text-xs text-inkSoft whitespace-pre-line">
                  {r.delivery_address ?? ""}
                  {r.delivery_notes ? ` — ${r.delivery_notes}` : ""}
                </div>
                {r.kind === "passes" ? (
                  <div className="text-sm">
                    <span className="inline-flex rounded-full bg-berryBg text-berry text-[11px] font-semibold px-2 py-0.5 mr-1.5">
                      Event passes
                    </span>
                    {r.event ? (
                      <span className="text-ink">
                        {r.event.name} · {fmtDate(r.event.event_date)}
                      </span>
                    ) : null}
                    <ul className="mt-1 space-y-0.5">
                      {r.items.map((i, n) => (
                        <li key={n} className="text-inkSoft">
                          {i.qty}× {i.name}
                          {i.kind === "pass" ? " pass" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                <ul className="text-sm space-y-0.5">
                  {r.items.map((i, n) => (
                    <li key={n}>
                      <span className="font-medium text-ink">{i.name}</span>{" "}
                      <span className="text-inkSoft">
                        {Object.entries(i.mix ?? {})
                          .filter(([, q]) => q > 0)
                          .map(([c, q]) => `${q}× ${FLAVOR[c] ?? c}`)
                          .join(" · ")}
                        {(i.deliveries ?? 1) > 1 ? ` (weekly × ${i.deliveries})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {r.orders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/dashboard/orders/${o.id}`}
                      className="rounded-full bg-cream ring-1 ring-border px-2 py-0.5 hover:ring-berry/40"
                    >
                      {o.external_id} · {fmtDate(o.delivery_date)} · {o.fulfillment_status}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {r.email_error ? (
                    <span className="text-coral font-semibold" title={r.email_error}>
                      ✉︎ Email failed: {r.email_error.slice(0, 90)}
                    </span>
                  ) : r.email_sent_at ? (
                    <span className="text-emerald-700">✉︎ Confirmation sent {fmtDate(r.email_sent_at)}</span>
                  ) : (
                    <span className="text-inkSoft">✉︎ No confirmation email recorded</span>
                  )}
                  <button
                    type="button"
                    onClick={() => resend(r)}
                    disabled={busy === r.id}
                    className="inline-flex items-center gap-1 font-semibold text-berry hover:underline disabled:opacity-50"
                  >
                    <Mail className="w-3 h-3" />
                    Resend email
                  </button>
                </div>
                {r.payment_verification !== "unverified" ? (
                  <p className="text-xs text-inkSoft">
                    {r.payment_verification === "verified" ? `Verified into ${r.verified_account_code}` : "Rejected"}
                    {r.reviewed_at ? ` · ${fmtDate(r.reviewed_at)}` : ""}
                    {r.review_note ? ` — ${r.review_note}` : ""}
                  </p>
                ) : null}
              </div>

              {r.payment_verification === "unverified" ? (
                <div className="md:w-52 shrink-0 flex flex-col gap-2">
                  <label className="text-xs text-inkSoft">
                    Money landed in
                    <Select
                      value={account[r.id] ?? defaultAccount}
                      onChange={(e) => setAccount((a) => ({ ...a, [r.id]: e.target.value }))}
                      className="mt-1"
                    >
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button onClick={() => review(r, "verified")} disabled={busy === r.id}>
                    <Check className="w-4 h-4" />
                    Verify
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(r)} disabled={busy === r.id}>
                    <X className="w-4 h-4" />
                    Reject
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {rejecting ? (
        <RejectModal
          row={rejecting}
          busy={busy === rejecting.id}
          onCancel={() => setRejecting(null)}
          onConfirm={(note) => review(rejecting, "rejected", note)}
        />
      ) : null}

      {zoom ? (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Payment screenshot" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}
    </div>
  );
}

function RejectModal({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: WebCheckoutRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = React.useState("");
  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      title={`Reject ${row.reference}?`}
      description="The payment is reversed out of Unverified Receipts, every delivery is marked Cancelled (kept in Orders as a record) and the stock is freed. The customer's order page will show it as cancelled."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Keep it
          </Button>
          <Button onClick={() => onConfirm(note.trim())} disabled={busy}>
            {busy ? "Rejecting…" : "Reject payment"}
          </Button>
        </>
      }
    >
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (e.g. no matching deposit)" />
    </Modal>
  );
}
