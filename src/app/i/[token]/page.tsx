import { createClient } from "@/lib/supabase/server";
import { COMPANY } from "@/lib/company";
import { InvoiceSheet, type InvoiceView } from "@/components/invoice-sheet";

export const dynamic = "force-dynamic";

type InvoicePayload = {
  bill: {
    external_id: string | null;
    bill_date: string | null;
    due_date: string | null;
    payment_terms: string | null;
    status: string;
    subtotal: number | string | null;
    delivery_fees: number | string | null;
    discount: number | string | null;
    total: number | string | null;
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
    amount: number | string | null;
    public_token: string | null;
  }>;
  adjustments: Array<{ description: string; amount: number | string }>;
};

export default async function PublicInvoicePage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_bill_invoice", { p_token: params.token });
  const payload = (data ?? null) as InvoicePayload | null;

  if (!payload) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">Invoice not found</p>
          <p className="text-sm text-inkSoft mt-1">
            This link may be expired or incorrect. Please contact {COMPANY.email}.
          </p>
        </div>
      </div>
    );
  }

  const view: InvoiceView = {
    bill: {
      external_id: payload.bill.external_id,
      bill_date: payload.bill.bill_date,
      due_date: payload.bill.due_date,
      payment_terms: payload.bill.payment_terms,
      status: payload.bill.status,
      subtotal: Number(payload.bill.subtotal ?? 0),
      delivery_fees: Number(payload.bill.delivery_fees ?? 0),
      discount: Number(payload.bill.discount ?? 0),
      total: Number(payload.bill.total ?? 0),
    },
    partner: payload.partner,
    lines: payload.lines.map((l) => ({
      order_external_id: l.order_external_id,
      receivable_external_id: l.receivable_external_id,
      order_date: l.order_date,
      delivery_date: l.delivery_date,
      amount: Number(l.amount ?? 0),
      public_token: l.public_token,
    })),
    adjustments: payload.adjustments.map((a) => ({
      description: a.description,
      amount: Number(a.amount ?? 0),
    })),
  };

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      <InvoiceSheet data={view} />
    </div>
  );
}
