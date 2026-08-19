import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { InvoiceSheet, type InvoiceView } from "@/components/invoice-sheet";
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

  const [{ data: bill }, { data: linked }, { data: adjustments }] = await Promise.all([
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
    supabase
      .from("bill_adjustments")
      .select("id, description, amount")
      .eq("bill_id", params.id)
      .order("created_at", { ascending: true }),
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

  const view: InvoiceView = {
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
    adjustments: ((adjustments ?? []) as Array<{ description: string; amount: number | string }>).map(
      (a) => ({ description: a.description, amount: Number(a.amount) }),
    ),
  };

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

      <InvoiceSheet data={view} />
    </div>
  );
}
