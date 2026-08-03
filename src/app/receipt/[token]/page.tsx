import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";

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
  const partnerName = receipt.partner.registered_business_name || receipt.partner.name || "Customer";

  return (
    <div className="min-h-screen bg-cream py-10 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto bg-white border border-border rounded-xl shadow-card overflow-hidden print:border-0 print:shadow-none">
        {/* Brand band */}
        <div className="bg-salmon">
          <Image
            src={COMPANY.logoSrc}
            alt={COMPANY.brandName}
            width={480}
            height={240}
            priority
            className="w-40 h-auto p-4"
          />
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                Delivery receipt
              </div>
              <div className="text-lg font-bold text-ink font-mono">{o.external_id ?? "—"}</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-inkSoft">Delivered to</div>
              <div className="font-semibold text-ink">{partnerName}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-inkSoft">Order date</div>
              <div className="text-ink">{formatDate(o.order_date)}</div>
            </div>
            <div>
              <div className="text-xs text-inkSoft">Delivery date</div>
              <div className="text-ink">{o.delivery_date ? formatDate(o.delivery_date) : "—"}</div>
            </div>
          </div>

          {/* Items */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream text-inkSoft">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Item</th>
                  <th className="text-right font-semibold px-3 py-2">Qty</th>
                  <th className="text-right font-semibold px-3 py-2">Unit</th>
                  <th className="text-right font-semibold px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {receipt.items.map((it, i) => (
                  <tr key={`${it.sku_code}-${i}`}>
                    <td className="px-3 py-2 text-ink">{it.sku_name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{it.qty}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPHP(it.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPHP(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="ml-auto w-full max-w-xs text-sm space-y-1">
            <Row label="Subtotal" value={formatPHP(o.subtotal)} />
            {Number(o.delivery_fee ?? 0) > 0 ? (
              <Row label="Delivery fee" value={formatPHP(o.delivery_fee)} />
            ) : null}
            {Number(o.discount ?? 0) > 0 ? (
              <Row label="Discount" value={`− ${formatPHP(o.discount)}`} />
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-1.5 mt-1.5 font-bold text-ink">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatPHP(o.total)}</span>
            </div>
          </div>

          <div className="text-center text-xs text-inkSoft pt-2 border-t border-border">
            {COMPANY.brandName} · {COMPANY.email}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-inkSoft">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-ink">{value}</span>
    </div>
  );
}
