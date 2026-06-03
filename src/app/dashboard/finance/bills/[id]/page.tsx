import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BillDetailClient, type BillDetail, type LinkedOrder, type LedgerLink } from "./bill-detail-client";
import { OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { RecordPager } from "@/components/record-pager";

const READ_ROLES = OWNER_PARTNER_MANAGER;

export default async function BillDetailPage({
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
  if (!role || !READ_ROLES.includes(role)) redirect("/dashboard/finance");

  const [
    { data: bill },
    { data: accounts },
    { data: linkedReceivables },
    { data: ledgerEntries },
  ] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id, external_id, bill_date, due_date, payment_terms, status, subtotal, delivery_fees, discount, total, paid_amount, paid_date, paid_account_code, wix_invoice_id, wix_invoice_url, notes, cancel_reason, issued_at, cancelled_at, partner_id, partner:partners(name, external_id, address, registered_business_name, tin)",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("accounts")
      .select("code, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("bill_receivables")
      .select(
        "receivable:receivables(id, external_id, amount, status, order:orders(id, external_id, order_date, total))",
      )
      .eq("bill_id", params.id),
    supabase
      .from("ledger_entries")
      .select("id, occurred_at, account_code, direction, amount, description, ref_external_id")
      .eq("ref_type", "bill")
      .eq("ref_id", params.id)
      .order("occurred_at", { ascending: true }),
  ]);

  if (!bill) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/finance/bills"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to bills
        </Link>
        <p className="text-sm text-inkSoft">Bill not found.</p>
      </div>
    );
  }

  const partner = (Array.isArray(bill.partner) ? bill.partner[0] : bill.partner) as
    | {
        name: string;
        external_id: string | null;
        address: string | null;
        registered_business_name: string | null;
        tin: string | null;
      }
    | null;

  // Flatten linked receivables/orders into a table-ready shape.
  const linkedOrders: LinkedOrder[] = ((linkedReceivables ?? []) as unknown as Array<{
    receivable:
      | {
          id: string;
          external_id: string | null;
          amount: number | string;
          status: string;
          order:
            | { id: string; external_id: string | null; order_date: string; total: number | string }
            | { id: string; external_id: string | null; order_date: string; total: number | string }[]
            | null;
        }
      | {
          id: string;
          external_id: string | null;
          amount: number | string;
          status: string;
          order:
            | { id: string; external_id: string | null; order_date: string; total: number | string }
            | { id: string; external_id: string | null; order_date: string; total: number | string }[]
            | null;
        }[];
  }>).flatMap((row) => {
    const recv = Array.isArray(row.receivable) ? row.receivable[0] : row.receivable;
    if (!recv) return [];
    const order = Array.isArray(recv.order) ? recv.order[0] : recv.order;
    return [
      {
        receivable_id: recv.id,
        receivable_external_id: recv.external_id,
        receivable_amount: Number(recv.amount ?? 0),
        receivable_status: recv.status,
        order_id: order?.id ?? null,
        order_external_id: order?.external_id ?? null,
        order_date: order?.order_date ?? null,
        order_total: order ? Number(order.total ?? 0) : 0,
      },
    ];
  });

  const billDetail: BillDetail = {
    id: bill.id,
    external_id: bill.external_id,
    bill_date: bill.bill_date,
    due_date: bill.due_date,
    payment_terms: bill.payment_terms,
    status: bill.status,
    subtotal: Number(bill.subtotal ?? 0),
    delivery_fees: Number(bill.delivery_fees ?? 0),
    discount: Number(bill.discount ?? 0),
    total: Number(bill.total ?? 0),
    paid_amount: Number(bill.paid_amount ?? 0),
    paid_date: bill.paid_date,
    paid_account_code: bill.paid_account_code,
    wix_invoice_id: bill.wix_invoice_id,
    wix_invoice_url: bill.wix_invoice_url,
    issued_at: bill.issued_at,
    cancelled_at: bill.cancelled_at,
    cancel_reason: bill.cancel_reason,
    notes: bill.notes,
    partner_id: bill.partner_id,
    partner_name: partner?.name ?? "—",
    partner_external_id: partner?.external_id ?? null,
    partner_address: partner?.address ?? null,
    partner_registered_business_name: partner?.registered_business_name ?? null,
    partner_tin: partner?.tin ?? null,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/dashboard/finance/bills"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to bills
        </Link>
        <RecordPager
          entity="bills"
          current={params.id}
          basePath="/dashboard/finance/bills"
        />
      </div>

      <BillDetailClient
        role={role}
        bill={billDetail}
        accounts={(accounts ?? []) as Array<{ code: string; name: string }>}
        linkedOrders={linkedOrders}
        ledgerEntries={(ledgerEntries ?? []) as LedgerLink[]}
      />
    </div>
  );
}
