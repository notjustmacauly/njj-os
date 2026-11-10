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
    delivery_fee: number | string | null;
    discount: number | string | null;
    subtotal: number | string | null;
    total: number | string | null;
  };
  partner: { name: string | null; registered_business_name: string | null };
  items: Array<{
    sku_code: string;
    sku_name: string;
    qty: number;
    unit_price: number | string;
    subtotal: number | string;
  }>;
};

export default async function DeliveryReceiptPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_delivery_receipt", { p_token: params.token });
  const receipt = (data ?? null) as Receipt | null;

  if (!receipt) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">Delivery not found</p>
          <p className="text-sm text-inkSoft mt-1">
            This link may be expired or incorrect. Please contact {COMPANY.email}.
          </p>
        </div>
      </div>
    );
  }

  const o = receipt.order;
  // Legal name is the bill-to; the partner's own name is the branch/location —
  // shown underneath so two sites sharing a registered name are told apart.
  const legalName = receipt.partner.registered_business_name || receipt.partner.name || "Customer";
  const branch =
    receipt.partner.name && receipt.partner.name !== receipt.partner.registered_business_name
      ? receipt.partner.name
      : null;

  return (
    <div className="min-h-screen bg-cream py-8 px-4 print:bg-white print:p-0">
      {/* Prints on whatever small sheet you select — A6 or 4x6 in (quarter of
          A4). `size: auto` follows the printer's chosen paper; the slip fills it. */}
      <style>{`@media print { @page { size: auto; margin: 5mm; } html, body { background: #fff; } }`}</style>

      <div className="mx-auto flex justify-center mb-3 print:hidden">
        <PrintButton />
      </div>

      {/* The slip. ~A6 width on screen; fills the A6 page on print. */}
      <div className="mx-auto bg-white text-ink w-[105mm] max-w-full border border-border rounded-md p-4 print:border-0 print:rounded-none print:p-0 print:w-auto text-[11px] leading-snug">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
          <div>
            <div className="font-bold text-[13px] tracking-tight">DELIVERY RECEIPT</div>
            <div className="font-mono text-[12px] font-semibold">{o.external_id ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-ink">{COMPANY.brandName}</div>
            {COMPANY.tin ? <div className="text-inkSoft text-[10px]">TIN: {COMPANY.tin}</div> : null}
          </div>
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

        <div className="text-center text-[9px] text-inkSoft mt-3">
          {COMPANY.brandName} · {COMPANY.email}
        </div>
      </div>
    </div>
  );
}
