import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";
import { MixChips } from "../../../_components/mix-chips";
import type { CheckoutReceipt } from "@/app/api/shop/checkout/emails";
import { fmtEventDate, timeRange } from "../../../_components/events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function OrderPage({ params }: { params: { token: string } }) {
  if (!UUID.test(params.token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("web_get_checkout", { p_token: params.token });
  const r = data as CheckoutReceipt | null;
  if (!r) notFound();

  const rejected = r.status === "rejected";
  if (r.kind === "passes") return <PassesReceipt r={r} rejected={rejected} />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center">
        {rejected ? (
          <>
            <h1 className="font-display text-3xl font-semibold text-ink">We couldn&apos;t confirm this payment</h1>
            <p className="mt-2 text-inkSoft">
              Order {r.reference} was cancelled. If you think this is a mistake, email us at{" "}
              <a className="text-berry underline" href={`mailto:${COMPANY.email}`}>
                {COMPANY.email}
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-14 h-14 text-berry mx-auto" />
            <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold text-ink">
              Payment completed 🎉
            </h1>
            <p className="mt-2 text-inkSoft">
              Thanks, {r.name.split(" ")[0]}! Your order <span className="font-semibold text-ink">{r.reference}</span>{" "}
              is confirmed. A copy is on its way to {r.email}.
            </p>
          </>
        )}
      </div>

      <div className="mt-10 rounded-3xl bg-white ring-1 ring-border p-6">
        <ul className="space-y-3">
          {r.items.map((i, n) => (
            <li key={n} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-ink">{i.name}</span>
                <span className="tabular-nums">{formatPHP(i.price)}</span>
              </div>
              {i.deliveries > 1 ? (
                <p className="text-xs text-inkSoft">Same mix every week for {i.deliveries} weeks</p>
              ) : null}
              <MixChips mix={i.mix} />
            </li>
          ))}
        </ul>
        <dl className="mt-4 text-sm space-y-1.5 border-t border-border pt-3">
          <div className="flex justify-between">
            <dt className="text-inkSoft">Delivery</dt>
            <dd className="tabular-nums">{formatPHP(r.delivery_total)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>{rejected ? "Total" : "Total paid"}</dt>
            <dd className="tabular-nums">{formatPHP(r.total)}</dd>
          </div>
        </dl>
      </div>

      {!rejected ? (
        <div className="mt-6 rounded-3xl bg-white ring-1 ring-border p-6 text-sm">
          <div className="font-semibold text-ink">{r.deliveries.length > 1 ? "Your deliveries" : "Delivery"}</div>
          <ol className="mt-2 space-y-1.5">
            {r.deliveries.map((d, n) => (
              <li key={d.reference} className="flex justify-between gap-3">
                <span>
                  {r.deliveries.length > 1 ? `${n + 1}. ` : ""}
                  {fmtDate(d.date)}
                </span>
                <span className="text-inkSoft">{d.status === "Delivered" ? "Delivered ✓" : "Scheduled"}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-inkSoft">
            Delivering to <span className="text-ink">{r.address ?? ""}</span>. We&apos;ll message you on the day.
          </p>
        </div>
      ) : null}

      <div className="mt-8 text-center">
        <Link href="/shop" className="inline-flex rounded-full bg-cream ring-1 ring-border px-6 py-3 font-semibold text-ink hover:bg-creamDk">
          Back to the shop
        </Link>
      </div>
    </div>
  );
}

async function PassesReceipt({ r, rejected }: { r: CheckoutReceipt; rejected: boolean }) {
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  // Each QR opens the staff check-in screen in the OS when scanned.
  const qrs = await Promise.all(
    r.passes.map((p) =>
      QRCode.toString(`${origin}/dashboard/checkin/${p.token}`, { type: "svg", margin: 1, width: 220, color: { dark: "#1A1A2E" } }),
    ),
  );
  const e = r.event;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center">
        {rejected ? (
          <>
            <h1 className="font-display text-3xl font-semibold text-ink">We couldn&apos;t confirm this payment</h1>
            <p className="mt-2 text-inkSoft">
              Order {r.reference} was cancelled and these passes are no longer valid. If you think this is a mistake, email{" "}
              <a className="text-berry underline" href={`mailto:${COMPANY.email}`}>
                {COMPANY.email}
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-14 h-14 text-berry mx-auto" />
            <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold text-ink">You&apos;re in! 🎉</h1>
            <p className="mt-2 text-inkSoft">
              Payment completed for <span className="font-semibold text-ink">{r.reference}</span>. Show these QR codes at the
              door — one per player. A copy went to {r.email}.
            </p>
          </>
        )}
      </div>

      {e ? (
        <div className="mt-8 rounded-3xl bg-white ring-1 ring-border p-6 text-sm">
          <div className="font-display font-semibold text-xl text-ink">{e.name}</div>
          <p className="mt-1 text-ink">
            {fmtEventDate(e.date)}
            {timeRange(e) ? ` · ${timeRange(e)}` : ""}
          </p>
          {e.venue ? (
            <p className="mt-0.5 text-inkSoft">
              {e.venue}
              {e.maps_url ? (
                <>
                  {" · "}
                  <a href={e.maps_url} target="_blank" rel="noreferrer" className="text-berry font-semibold">
                    Open in Maps
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {!rejected ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {r.passes.map((p, i) => (
            <div key={p.token} className="rounded-3xl bg-white ring-1 ring-border p-5 text-center">
              <div className="text-xs uppercase tracking-smallcaps font-semibold text-berry">
                Pass {i + 1} of {r.passes.length}
              </div>
              <div className="font-semibold text-ink mt-1">{p.sport}</div>
              <div className="mx-auto mt-3 w-48 h-48" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
              <div className="mt-2 text-xs text-inkSoft font-mono">{p.code}</div>
              {p.checked_in ? <div className="mt-1 text-xs font-semibold text-emerald-700">Checked in ✓</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl bg-white ring-1 ring-border p-6 text-sm">
        <ul className="space-y-1.5">
          {r.items.map((i, n) => (
            <li key={n} className="flex justify-between">
              <span>
                {i.qty}× {i.name}
                {i.kind === "pass" ? " pass" : ""}
              </span>
              <span className="tabular-nums">{formatPHP(i.qty * i.price)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold">
          <span>{rejected ? "Total" : "Total paid"}</span>
          <span className="tabular-nums">{formatPHP(r.total)}</span>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/events" className="inline-flex rounded-full bg-cream ring-1 ring-border px-6 py-3 font-semibold text-ink hover:bg-creamDk">
          More events
        </Link>
      </div>
    </div>
  );
}
