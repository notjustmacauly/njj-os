import Link from "next/link";
import Image from "next/image";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { COMPANY } from "@/lib/company";
import { formatPHP, formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type OrderRel = {
  external_id: string | null;
  order_date: string | null;
  delivery_date: string | null;
  public_token: string | null;
};

export default async function BillInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = roleRow?.role as Role | null;
  if (!role || !OWNER_PARTNER_MANAGER.includes(role)) redirect("/dashboard/finance");

  const [{ data: bill }, { data: linked }] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id, external_id, bill_date, due_date, payment_terms, status, subtotal, delivery_fees, discount, total, partner:partners(name, registered_business_name, tin, address, email)",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("bill_receivables")
      .select(
        "receivable:receivables(external_id, amount, order:orders(external_id, order_date, delivery_date, public_token))",
      )
      .eq("bill_id", params.id),
  ]);

  if (!bill) notFound();

  const partner = (Array.isArray(bill.partner) ? bill.partner[0] : bill.partner) as
    | { name: string; registered_business_name: string | null; tin: string | null; address: string | null; email: string | null }
    | null;

  const lines = ((linked ?? []) as unknown as Array<{
    receivable:
      | { external_id: string | null; amount: number | string; order: OrderRel | OrderRel[] | null }
      | { external_id: string | null; amount: number | string; order: OrderRel | OrderRel[] | null }[]
      | null;
  }>).flatMap((row) => {
    const recv = Array.isArray(row.receivable) ? row.receivable[0] : row.receivable;
    if (!recv) return [];
    const order = Array.isArray(recv.order) ? recv.order[0] : recv.order;
    return [
      {
        receivable_external_id: recv.external_id,
        amount: Number(recv.amount ?? 0),
        order_external_id: order?.external_id ?? null,
        order_date: order?.order_date ?? null,
        delivery_date: order?.delivery_date ?? null,
        public_token: order?.public_token ?? null,
      },
    ];
  });

  const billToName = partner?.registered_business_name || partner?.name || "—";

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      {/* Toolbar (hidden in print) */}
      <div className="print:hidden max-w-3xl mx-auto flex items-center justify-between gap-2 px-4 pt-6">
        <Link
          href={`/dashboard/finance/bills/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to bill
        </Link>
        <PrintButton />
      </div>

      {/* Invoice sheet */}
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
              {partner?.tin ? <div className="text-inkSoft">TIN: {partner.tin}</div> : null}
              {partner?.address ? <div className="text-inkSoft whitespace-pre-line">{partner.address}</div> : null}
              {partner?.email ? <div className="text-inkSoft">{partner.email}</div> : null}
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
            {Number(bill.delivery_fees ?? 0) > 0 ? (
              <TotalRow label="Delivery fees" value={formatPHP(bill.delivery_fees)} />
            ) : null}
            {Number(bill.discount ?? 0) > 0 ? (
              <TotalRow label="Discount" value={`− ${formatPHP(bill.discount)}`} />
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2 mt-1 text-base font-bold text-ink">
              <span>Total due</span>
              <span className="font-mono tabular-nums">{formatPHP(bill.total)}</span>
            </div>
          </div>

          <div className="text-center text-xs text-inkSoft pt-4 border-t border-border">
            {COMPANY.brandName} — Thank you for your business. Questions? {COMPANY.email}
          </div>
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
