import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";
import { MixChips } from "../../../_components/mix-chips";
import type { CheckoutReceipt } from "@/app/api/shop/checkout/emails";

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
            Delivering to <span className="text-ink">{r.address}</span>. We&apos;ll message you on the day.
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
