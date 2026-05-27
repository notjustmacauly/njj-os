import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ReceivablesView, type ReceivableRow } from "./receivables-view";
import { OWNER_PARTNER, type Role } from "@/lib/roles";

// Force fresh data on every request — without this Next.js's fetch cache
// can hold a stale (often empty) Supabase response. Receivables can be
// created seconds before this page is loaded; we must not cache them.
export const dynamic = "force-dynamic";

const FINANCE_ROLES = OWNER_PARTNER;

export default async function ReceivablesPage() {
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
  if (!role || !FINANCE_ROLES.includes(role)) redirect("/dashboard");

  // The bills embed must be qualified by the FK name — a bill_receivables
  // junction table exists, so 'bills' alone is ambiguous for Postgrest and
  // makes the whole query return empty with PGRST201.
  const [{ data: rows }, { data: accountsData }] = await Promise.all([
    supabase
      .from("receivables")
      .select(
        "id, external_id, created_at, amount, status, due_date, order_id, partner_id, bill_id, paid_amount, paid_date, paid_account_code, partner:partners(name), order_ref:orders(external_id), bill:bills!receivables_bill_id_fkey(external_id)",
      )
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("code, name, is_active")
      .eq("is_active", true)
      .order("code"),
  ]);

  const accounts = ((accountsData ?? []) as Array<{ code: string; name: string }>);

  const normalized: ReceivableRow[] = ((rows ?? []) as unknown as Array<{
    id: string;
    external_id: string | null;
    created_at: string;
    amount: number | string;
    status: "pending" | "billed" | "paid" | "cancelled";
    due_date: string | null;
    order_id: string;
    partner_id: string;
    bill_id: string | null;
    paid_amount: number | string | null;
    paid_date: string | null;
    paid_account_code: string | null;
    partner: { name: string } | { name: string }[] | null;
    order_ref: { external_id: string | null } | { external_id: string | null }[] | null;
    bill: { external_id: string | null } | { external_id: string | null }[] | null;
  }>).map((r) => {
    const partner = Array.isArray(r.partner) ? r.partner[0] : r.partner;
    const order = Array.isArray(r.order_ref) ? r.order_ref[0] : r.order_ref;
    const bill = Array.isArray(r.bill) ? r.bill[0] : r.bill;
    return {
      id: r.id,
      external_id: r.external_id,
      created_at: r.created_at,
      amount: Number(r.amount ?? 0),
      status: r.status,
      due_date: r.due_date,
      order_id: r.order_id,
      partner_id: r.partner_id,
      bill_id: r.bill_id,
      paid_amount: r.paid_amount == null ? null : Number(r.paid_amount),
      paid_date: r.paid_date,
      paid_account_code: r.paid_account_code,
      partner_name: partner?.name ?? "—",
      order_external_id: order?.external_id ?? null,
      bill_external_id: bill?.external_id ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/finance"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Finance
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">📨</span>
          Receivables
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Outstanding partner balances. Created automatically when delivered orders are unpaid.
        </p>
      </header>

      <ReceivablesView rows={normalized} role={role} accounts={accounts} />
    </div>
  );
}
