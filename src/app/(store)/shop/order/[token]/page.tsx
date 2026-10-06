import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP } from "@/lib/utils";
import { MixChips } from "../../../_components/mix-chips";
import type { CheckoutReceipt } from "@/app/api/shop/checkout/emails";
import { fmtEventDate, timeRange } from "../../../_components/events";
import { CheckCircleLine } from "../../../_components/icons";
import { Btn, Container, Panel } from "../../../_components/ui";

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
    <Container className="pt-14 md:pt-20 max-w-3xl">
      <Header r={r} rejected={rejected} title="Payment completed." body={`Your order ${r.reference} is confirmed. A copy is on its way to ${r.email}.`} />

      <div className="mt-12 grid gap-4">
        <Panel>
          <ul className="grid gap-4">
            {r.items.map((i, n) => (
              <li key={n} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold text-s-fg">{i.name}</span>
                  <span className="tabular-nums text-s-fg">{formatPHP(i.price)}</span>
                </div>
                {(i.deliveries ?? 1) > 1 ? (
                  <p className="text-xs text-s-muted mt-0.5">Same mix every week for {i.deliveries} weeks</p>
                ) : null}
                <MixChips mix={i.mix ?? {}} />
              </li>
            ))}
          </ul>
          <Totals r={r} rejected={rejected} delivery />
        </Panel>

        {!rejected ? (
          <Panel>
            <p className="text-sm font-semibold text-s-fg">{r.deliveries.length > 1 ? "Your deliveries" : "Delivery"}</p>
            <ol className="mt-4 grid gap-2">
              {r.deliveries.map((d, n) => (
                <li key={d.reference} className="flex items-center justify-between gap-3 rounded-[16px] bg-s-sunken/70 px-4 py-3 text-sm">
                  <span className="text-s-fg">
                    {r.deliveries.length > 1 ? <span className="text-s-muted tabular-nums mr-2">{n + 1}</span> : null}
                    {fmtDate(d.date)}
                  </span>
                  <span className="text-s-muted">{d.status === "Delivered" ? "Delivered" : "Scheduled"}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm text-s-muted">
              Delivering to <span className="text-s-fg">{r.address ?? ""}</span>. We&apos;ll message you on the day.
            </p>
          </Panel>
        ) : null}
      </div>

      <div className="mt-10">
        <Btn href="/shop" variant="quiet">
          Back to the shop
        </Btn>
      </div>
    </Container>
  );
}

function Header({ r, rejected, title, body }: { r: CheckoutReceipt; rejected: boolean; title: string; body: string }) {
  if (rejected) {
    return (
      <div>
        <h1 className="font-display font-semibold tracking-[-0.04em] leading-[1] text-5xl text-s-fg">We couldn&apos;t confirm this payment.</h1>
        <p className="mt-5 text-lg text-s-muted max-w-[52ch]">
          Order {r.reference} was cancelled. If you think this is a mistake, email{" "}
          <a className="text-s-fg underline underline-offset-4" href={`mailto:${COMPANY.email}`}>
            {COMPANY.email}
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <div>
      <CheckCircleLine className="w-12 h-12 text-s-fg" />
      <h1 className="mt-6 font-display font-semibold tracking-[-0.04em] leading-[1] text-5xl md:text-6xl text-s-fg">{title}</h1>
      <p className="mt-5 text-lg text-s-muted max-w-[52ch]">
        Thanks, {r.name.split(" ")[0]}. {body}
      </p>
    </div>
  );
}

function Totals({ r, rejected, delivery }: { r: CheckoutReceipt; rejected: boolean; delivery?: boolean }) {
  return (
    <dl className="mt-5 grid gap-2 text-sm border-t border-s-line/[0.08] pt-4">
      {delivery ? (
        <div className="flex justify-between">
          <dt className="text-s-muted">Delivery</dt>
          <dd className="tabular-nums text-s-fg">{formatPHP(r.delivery_total)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between text-base font-semibold text-s-fg">
        <dt>{rejected ? "Total" : "Total paid"}</dt>
        <dd className="tabular-nums">{formatPHP(r.total)}</dd>
      </div>
    </dl>
  );
}

async function PassesReceipt({ r, rejected }: { r: CheckoutReceipt; rejected: boolean }) {
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  // Each QR opens the staff check-in screen in the OS when scanned.
  const qrs = await Promise.all(
    r.passes.map((p) =>
      QRCode.toString(`${origin}/dashboard/checkin/${p.token}`, { type: "svg", margin: 1, width: 220, color: { dark: "#121212", light: "#ffffff" } }),
    ),
  );
  const e = r.event;

  return (
    <Container className="pt-14 md:pt-20 max-w-3xl">
      <Header
        r={r}
        rejected={rejected}
        title="You're in."
        body={`Payment completed for ${r.reference}. Show these QR codes at the door, one per player. A copy went to ${r.email}.`}
      />

      {e ? (
        <Panel className="mt-12">
          <p className="font-display text-2xl font-semibold tracking-[-0.02em] text-s-fg">{e.name}</p>
          <p className="mt-2 text-s-fg">
            {fmtEventDate(e.date)}
            {timeRange(e) ? `, ${timeRange(e)}` : ""}
          </p>
          {e.venue ? (
            <p className="mt-1 text-s-muted">
              {e.venue}
              {e.maps_url ? (
                <>
                  {". "}
                  <a href={e.maps_url} target="_blank" rel="noreferrer" className="font-semibold text-s-fg underline underline-offset-4">
                    Open in Maps
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </Panel>
      ) : null}

      {!rejected ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {r.passes.map((p, i) => (
            <div key={p.token} className="rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 text-center">
              <p className="text-sm text-s-muted">
                Pass {i + 1} of {r.passes.length}
              </p>
              <p className="font-semibold text-s-fg mt-0.5">{p.sport}</p>
              <div className="mx-auto mt-4 w-48 h-48 rounded-[16px] overflow-hidden bg-white p-2" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
              <p className="mt-3 text-xs text-s-muted font-mono">{p.code}</p>
              {p.checked_in ? <p className="mt-1 text-xs font-semibold text-s-fg">Checked in</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <Panel className="mt-4">
        <ul className="grid gap-2 text-sm">
          {r.items.map((i, n) => (
            <li key={n} className="flex justify-between">
              <span className="text-s-fg">
                {i.qty} × {i.name}
                {i.kind === "pass" ? " pass" : ""}
              </span>
              <span className="tabular-nums text-s-fg">{formatPHP(i.qty * i.price)}</span>
            </li>
          ))}
        </ul>
        <Totals r={r} rejected={rejected} />
      </Panel>

      <div className="mt-10">
        <Link href="/events" className="text-sm font-semibold text-s-fg underline underline-offset-4">
          More events
        </Link>
      </div>
    </Container>
  );
}
