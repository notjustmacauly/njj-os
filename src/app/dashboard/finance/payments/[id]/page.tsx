import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PaymentDetailClient, type LedgerLink, type PaymentDetail } from "./payment-detail-client";

type Role = "admin" | "manager" | "ops" | "staff";
// Staff is allowed in — RLS limits them to their own reimbursements, so the
// payment row will simply come back null for anything else (rendered as
// "Payment not found").
const READ_ROLES: Role[] = ["admin", "manager", "ops", "staff"];

export default async function PaymentDetailPage({
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
  if (!role || !READ_ROLES.includes(role)) redirect("/dashboard");

  const [{ data: payment }, { data: accounts }, ledgerRes] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, external_id, created_at, type, purpose, payee, category, amount, account_code, transfer_to_account_code, status, paid_at, paid_date, paid_by_user_id, requested_by_user_id, requested_by_name, ledger_entry_id_out, ledger_entry_id_in, cancelled_at, cancelled_by_user_id, cancel_reason, notes",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("accounts").select("code, name").order("name"),
    // Staff can't read ledger_entries (RLS is ops+); for staff this just
    // returns an empty list, which the detail page renders gracefully.
    role === "staff"
      ? Promise.resolve({ data: [] as unknown[] })
      : supabase
          .from("ledger_entries")
          .select("id, occurred_at, account_code, direction, amount, description, ref_external_id")
          .eq("ref_id", params.id)
          .order("occurred_at", { ascending: true }),
  ]);
  const ledgerEntries = ledgerRes.data;

  if (!payment) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/finance/payments"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to payments
        </Link>
        <p className="text-sm text-inkSoft">Payment not found.</p>
      </div>
    );
  }

  const isReimbursement = payment.type === "reimbursement";
  const backHref = isReimbursement
    ? "/dashboard/finance/reimbursements"
    : "/dashboard/finance/payments";

  // For reimbursements, also fetch the auto-created expense (when payment is paid).
  let linkedExpense: { id: string; external_id: string | null; category: string } | null = null;
  if (isReimbursement && payment.status === "paid" && payment.external_id) {
    const { data: exp } = await supabase
      .from("expenses")
      .select("id, external_id, category")
      .eq("payment_ref", payment.external_id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    linkedExpense = exp;
  }

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {isReimbursement ? "reimbursements" : "payments"}
      </Link>

      <PaymentDetailClient
        role={role}
        currentUserId={user.id}
        payment={payment as PaymentDetail}
        accounts={(accounts ?? []) as Array<{ code: string; name: string }>}
        ledgerEntries={(ledgerEntries ?? []) as LedgerLink[]}
        linkedExpense={linkedExpense}
      />
    </div>
  );
}
