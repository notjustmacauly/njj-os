import Image from "next/image";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";
import { PrintedAt, PrintButton } from "./print-controls";

export const dynamic = "force-dynamic";

type Receipt = {
  order: {
    external_id: string | null;
    order_date: string | null;
    delivery_date: string | null;
    channel: string | null;
    payment_status: string | null;
    fulfillment_status: string | null;
    delivery_fee: number | string | null;
    discount: number | string | null;
    subtotal: number | string | null;
    total: number | string | null;
  };
  partner: { name: string | null; registered_business_name: string | null };
  items: Array<{ sku_code: string; sku_name: string; qty: number; unit_price: number | string; subtotal: number | string }>;
};

export default async function DeliveryReceiptPage({ params }: { params: { token: string } }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_delivery_receipt", { p_token: params.token });
  const receipt = (data ?? null) as Receipt | null;

  if (!receipt) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">Delivery not found</p>
          <p className="text-sm text-inkSoft mt-1">This link may be expired or incorrect. Please contact {COMPANY.email}.</p>
        </div>
      </div>
    );
  }

  const o = receipt.order;
  const legalName = receipt.partner.registered_business_name || receipt.partner.name || "Customer";
  const branch =
    receipt.partner.name && receipt.partner.name !== receipt.partner.registered_business_name ? receipt.partner.name : null;
  const paid = o.payment_status === "Paid";

  // Verify QR → this same page (live digital record + status).
  const h = headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const selfUrl = `${proto}://${host}/receipt/${params.token}`;
  const qrSvg = await QRCode.toString(selfUrl, {
    type: "svg", margin: 0, width: 120, color: { dark: "#121212", light: "#ffffff" },
  });

  return (
    <div className="min-h-screen bg-cream py-8 px-4 print:bg-white print:p-0">
      {/* Prints on whatever small sheet you select — A6 or 4x6 in (quarter of A4). */}
      <style>{`@media print { @page { size: auto; margin: 5mm; } html, body { background: #fff; } }`}</style>

      <div className="mx-auto flex justify-center mb-3 print:hidden">
        <PrintButton />
      </div>

      {/* Online-only status + how-to-pay (not printed on the slip). */}
      <div className="print:hidden mx-auto w-[105mm] max-w-full mb-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${paid ? "bg-greenBg text-green" : "bg-yellowBg text-yellow"}`}>
            Payment: {o.payment_status ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold bg-creamDk text-inkSoft">
            {o.fulfillment_status ?? "—"}
          </span>
        </div>
        {!paid ? (
          <div className="bg-white border border-border rounded-md p-3 text-xs">
            <div className="font-semibold text-ink mb-2">How to pay</div>
            <div className="flex gap-3">
              {COMPANY.payQrSrc ? (
                <Image src={COMPANY.payQrSrc} alt="Payment QR" width={96} height={96} className="w-24 h-24 object-contain shrink-0" />
              ) : null}
              <div className="space-y-1.5">
                {COMPANY.paymentAccounts.map((a) => (
                  <div key={a.accountNumber}>
                    <div className="font-medium text-ink">{a.label} · {a.bank}</div>
                    <div className="text-inkSoft">{a.accountName} — <span className="font-mono">{a.accountNumber}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* The printable slip. */}
      <div className="mx-auto bg-white text-ink w-[105mm] max-w-full border border-border rounded-md p-4 print:border-0 print:rounded-none print:p-0 print:w-auto text-[11px] leading-snug">
        {/* Header: logo + company, then title + order no */}
        <div className="flex items-center justify-between gap-2 pb-2">
          <Image src={COMPANY.logoSrc} alt={COMPANY.brandName} width={300} height={150} priority className="w-24 h-auto" />
          <div className="text-right text-[9px] text-inkSoft leading-tight">
            {COMPANY.tin ? <div>TIN: {COMPANY.tin}</div> : null}
            {COMPANY.email ? <div>{COMPANY.email}</div> : null}
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="font-bold text-[13px] tracking-tight">DELIVERY RECEIPT</div>
          <div className="font-mono text-[12px] font-semibold">{o.external_id ?? "—"}</div>
        </div>

        {/* Parties + dates */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 py-2 border-b border-border">
          <div className="col-span-2">
            <span className="text-inkSoft text-[10px] uppercase tracking-smallcaps">Delivered to</span>
            <div className="font-semibold">{legalName}</div>
            {branch ? <div>{branch}</div> : null}
          </div>
          <div>
            <span className="text-inkSoft text-[10px]">Order date</span>
            <div>{formatDate(o.order_date)}</div>
          </div>
          <div>
            <span className="text-inkSoft text-[10px]">Printed</span>
            <div><PrintedAt /></div>
          </div>
        </div>

        {/* Items */}
        <table className="w-full my-2">
          <thead className="text-inkSoft text-[10px]">
            <tr className="border-b border-border">
              <th className="text-left font-semibold py-1">Item</th>
              <th className="text-right font-semibold py-1">Qty</th>
              <th className="text-right font-semibold py-1">Unit</th>
              <th className="text-right font-semibold py-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((it, i) => (
              <tr key={`${it.sku_code}-${i}`} className="border-b border-border/60">
                <td className="py-1 pr-1">{it.sku_name}</td>
                <td className="py-1 text-right font-mono tabular-nums">{it.qty}</td>
                <td className="py-1 text-right font-mono tabular-nums">{formatPHP(it.unit_price)}</td>
                <td className="py-1 text-right font-mono tabular-nums">{formatPHP(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto w-full max-w-[60mm] space-y-0.5">
          {Number(o.delivery_fee ?? 0) > 0 ? (
            <div className="flex justify-between text-inkSoft"><span>Delivery fee</span><span className="font-mono tabular-nums">{formatPHP(o.delivery_fee)}</span></div>
          ) : null}
          {Number(o.discount ?? 0) > 0 ? (
            <div className="flex justify-between text-inkSoft"><span>Discount</span><span className="font-mono tabular-nums">− {formatPHP(o.discount)}</span></div>
          ) : null}
          <div className="flex justify-between font-bold border-t border-border pt-1">
            <span>Total</span><span className="font-mono tabular-nums">{formatPHP(o.total)}</span>
          </div>
        </div>

        {/* Pen fields: delivery date + signature */}
        <div className="mt-3 pt-2 border-t border-border grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <div className="h-4" />
            <div className="border-t border-ink" />
            <div className="text-[10px] text-inkSoft mt-0.5">Delivery date</div>
          </div>
          <div>
            <div className="h-4" />
            <div className="border-t border-ink" />
            <div className="text-[10px] text-inkSoft mt-0.5">Received by (name &amp; signature)</div>
          </div>
        </div>

        {/* Verify QR */}
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-2">
          <div className="w-[18mm] h-[18mm] shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="text-[9px] text-inkSoft">
            Scan to view &amp; verify this order online — shows the live payment status.
          </div>
        </div>

        <div className="text-center text-[9px] text-inkSoft mt-2">{COMPANY.brandName} · {COMPANY.email}</div>
      </div>
    </div>
  );
}
