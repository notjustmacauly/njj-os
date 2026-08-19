import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceData } from "@/lib/bill-invoice-pdf";

type OrderRel = {
  external_id: string | null;
  order_date: string | null;
  delivery_date: string | null;
  public_token: string | null;
};

// Assembles the InvoiceData payload used to render the branded PDF. Shared by
// the "Email to partner" route and the "Download PDF" route so the two stay in
// sync. Returns null when the bill doesn't exist. `origin` is baked into the
// PDF's clickable delivery links and image srcs.
export async function buildInvoiceData(
  supabase: SupabaseClient,
  billId: string,
  origin: string,
): Promise<InvoiceData | null> {
  const [{ data: bill }, { data: linked }, { data: adjustmentsData }] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id, external_id, bill_date, due_date, payment_terms, status, subtotal, delivery_fees, discount, total, partner:partners(name, registered_business_name, tin, address, email)",
      )
      .eq("id", billId)
      .maybeSingle(),
    supabase
      .from("bill_receivables")
      .select(
        "receivable:receivables(external_id, amount, order:orders(external_id, order_date, delivery_date, public_token))",
      )
      .eq("bill_id", billId),
    supabase
      .from("bill_adjustments")
      .select("description, amount")
      .eq("bill_id", billId)
      .order("created_at", { ascending: true }),
  ]);

  if (!bill) return null;

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
        order_external_id: order?.external_id ?? null,
        receivable_external_id: recv.external_id,
        order_date: order?.order_date ?? null,
        delivery_date: order?.delivery_date ?? null,
        amount: Number(recv.amount ?? 0),
        public_token: order?.public_token ?? null,
      },
    ];
  });

  return {
    origin,
    bill: {
      external_id: bill.external_id,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      payment_terms: bill.payment_terms,
      status: bill.status,
      subtotal: Number(bill.subtotal ?? 0),
      delivery_fees: Number(bill.delivery_fees ?? 0),
      discount: Number(bill.discount ?? 0),
      total: Number(bill.total ?? 0),
    },
    partner: {
      name: partner?.name ?? null,
      registered_business_name: partner?.registered_business_name ?? null,
      tin: partner?.tin ?? null,
      address: partner?.address ?? null,
      email: partner?.email ?? null,
    },
    lines,
    adjustments: ((adjustmentsData ?? []) as Array<{ description: string; amount: number | string }>).map((a) => ({
      description: a.description,
      amount: Number(a.amount ?? 0),
    })),
  };
}

// Renders the branded invoice PDF to a Buffer. Kept here so both routes render
// identically. Dynamic imports keep @react-pdf/renderer out of the edge bundle.
export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const React = await import("react");
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { BillInvoicePdf } = await import("@/lib/bill-invoice-pdf");
  // BillInvoicePdf renders a <Document> at its root; the react-pdf types insist
  // the top-level element be typed as Document, so cast past the check.
  const pdfElement = React.createElement(BillInvoicePdf, { data }) as unknown as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(pdfElement);
}
