import Image from "next/image";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";

// Normalised, presentational view of an invoice. Shared by the internal
// /bill/[id] page (authed) and the public /i/[token] page (token-gated) so
// the two never drift. Amounts are pre-coerced to numbers by the caller.
export type InvoiceView = {
  bill: {
    external_id: string | null;
    bill_date: string | null;
    due_date: string | null;
    payment_terms: string | null;
    status: string;
    subtotal: number;
    delivery_fees: number;
    discount: number;
    total: number;
  };
  partner: {
    name: string | null;
    registered_business_name: string | null;
    tin: string | null;
    address: string | null;
    email: string | null;
  };
  lines: Array<{
    order_external_id: string | null;
    receivable_external_id: string | null;
    order_date: string | null;
    delivery_date: string | null;
    amount: number;
    public_token: string | null;
  }>;
  adjustments: Array<{ description: string; amount: number }>;
};

export function InvoiceSheet({ data }: { data: InvoiceView }) {
  const { bill, partner, lines, adjustments } = data;
  const billToName = partner.registered_business_name || partner.name || "—";

  return (
    <div className="max-w-3xl mx-auto my-6 bg-white border border-border rounded-xl shadow-card overflow-hidden print:my-0 print:border-0 print:shadow-none print:rounded-none">
      <div className="bg-salmon">
        <Image
          src={COMPANY.logoSrc}
          alt={COMPANY.brandName}
          width={480}
          height={240}
          priority
          className="w-44 h-auto p-4"
        />
      </div>

      <div className="p-8 space-y-8">
        {/* Header: from + invoice meta */}
        <div className="flex items-start justify-between gap-6">
          <div className="text-sm">
            <div className="font-bold text-ink">{COMPANY.registeredName}</div>
            {COMPANY.tin ? <div className="text-inkSoft">TIN: {COMPANY.tin}</div> : null}
            {COMPANY.address ? <div className="text-inkSoft whitespace-pre-line">{COMPANY.address}</div> : null}
            <div className="text-inkSoft">{COMPANY.email}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-ink tracking-tight">INVOICE</div>
            <div className="text-sm font-mono text-inkSoft">{bill.external_id ?? "—"}</div>
            <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mt-2">
              {bill.status}
            </div>
          </div>
        </div>

        {/* Bill to + dates */}
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">Bill to</div>
            <div className="font-semibold text-ink">{billToName}</div>
            {partner.tin ? <div className="text-inkSoft">TIN: {partner.tin}</div> : null}
            {partner.address ? <div className="text-inkSoft whitespace-pre-line">{partner.address}</div> : null}
            {partner.email ? <div className="text-inkSoft">{partner.email}</div> : null}
          </div>
          <div className="text-right space-y-1">
            <MetaRow label="Bill date" value={formatDate(bill.bill_date)} />
            <MetaRow label="Due date" value={bill.due_date ? formatDate(bill.due_date) : "—"} />
            {bill.payment_terms ? <MetaRow label="Terms" value={bill.payment_terms} /> : null}
          </div>
        </div>

        {/* Deliveries */}
        <div>
          <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
            Deliveries ({lines.length})
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream text-inkSoft">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Delivery</th>
                  <th className="text-left font-semibold px-3 py-2">Order date</th>
                  <th className="text-left font-semibold px-3 py-2">Delivered</th>
                  <th className="text-right font-semibold px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => (
                  <tr key={`${l.receivable_external_id}-${i}`}>
                    <td className="px-3 py-2">
                      {l.public_token ? (
                        <a
                          href={`/receipt/${l.public_token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-berry underline underline-offset-2"
                        >
                          {l.order_external_id ?? l.receivable_external_id ?? "View delivery"}
                        </a>
                      ) : (
                        <span className="font-mono text-ink">{l.order_external_id ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-inkSoft">{l.order_date ? formatDate(l.order_date) : "—"}</td>
                    <td className="px-3 py-2 text-inkSoft">{l.delivery_date ? formatDate(l.delivery_date) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatPHP(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-inkSoft mt-1.5 print:block">
            Tap any delivery to view its full itemised receipt.
          </p>
        </div>

        {/* Totals */}
        <div className="ml-auto w-full max-w-xs text-sm space-y-1">
          <TotalRow label="Subtotal" value={formatPHP(bill.subtotal)} />
          {bill.delivery_fees > 0 ? (
            <TotalRow label="Delivery fees" value={formatPHP(bill.delivery_fees)} />
          ) : null}
          {bill.discount > 0 ? (
            <TotalRow label="Discount" value={`− ${formatPHP(bill.discount)}`} />
          ) : null}
          {adjustments.map((a, i) => (
            <TotalRow
              key={i}
              label={a.description}
              value={`${a.amount < 0 ? "− " : "+ "}${formatPHP(Math.abs(a.amount))}`}
            />
          ))}
          <div className="flex items-center justify-between border-t border-border pt-2 mt-1 text-base font-bold text-ink">
            <span>Total due</span>
            <span className="font-mono tabular-nums">{formatPHP(bill.total)}</span>
          </div>
        </div>

        {COMPANY.paymentAccounts.length > 0 ? (
          <div className="border-t border-border pt-4 flex items-start justify-between gap-4">
            <div className="text-sm space-y-3">
              <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                Pay to
              </div>
              {COMPANY.paymentAccounts.map((a) => (
                <div key={a.label}>
                  <div className="text-xs text-inkSoft">{a.label}</div>
                  <div className="font-semibold text-ink">{a.accountName}</div>
                  <div className="text-inkSoft">
                    {a.bank} · <span className="font-mono">{a.accountNumber}</span>
                  </div>
                </div>
              ))}
            </div>
            {COMPANY.payQrSrc ? (
              <div className="text-center shrink-0">
                <Image src={COMPANY.payQrSrc} alt="Payment QR" width={112} height={112} className="w-28 h-28 object-contain" />
                <div className="text-[10px] text-inkSoft mt-1">Scan to pay</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="text-center text-xs text-inkSoft pt-4 border-t border-border">
          {COMPANY.brandName} — Thank you for your business. Questions? {COMPANY.email}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-inkSoft">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-inkSoft">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-ink">{value}</span>
    </div>
  );
}
