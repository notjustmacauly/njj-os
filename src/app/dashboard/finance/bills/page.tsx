import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillsList, type BillRow } from "./bills-list";
import { OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";

const READ_ROLES = OWNER_PARTNER_MANAGER;

export default async function BillsPage() {
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

  const { data: bills } = await supabase
    .from("bills")
    .select(
      "id, external_id, bill_date, due_date, status, subtotal, total, paid_amount, paid_date, paid_account_code, partner_id, wix_invoice_url, partner:partners(name)",
    )
    .is("deleted_at", null)
    .order("bill_date", { ascending: false })
    .order("created_at", { ascending: false });

  const normalized: BillRow[] = ((bills ?? []) as unknown as Array<{
    id: string;
    external_id: string | null;
    bill_date: string;
    due_date: string | null;
    status: BillRow["status"];
    subtotal: number | string;
    total: number | string;
    paid_amount: number | string;
    paid_date: string | null;
    paid_account_code: string | null;
    partner_id: string;
    wix_invoice_url: string | null;
    partner: { name: string } | { name: string }[] | null;
  }>).map((b) => {
    const partner = Array.isArray(b.partner) ? b.partner[0] : b.partner;
    return {
      id: b.id,
      external_id: b.external_id,
      bill_date: b.bill_date,
      due_date: b.due_date,
      status: b.status,
      subtotal: Number(b.subtotal ?? 0),
      total: Number(b.total ?? 0),
      paid_amount: Number(b.paid_amount ?? 0),
      paid_date: b.paid_date,
      paid_account_code: b.paid_account_code,
      partner_id: b.partner_id,
      partner_name: partner?.name ?? "—",
      wix_invoice_url: b.wix_invoice_url,
    };
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">📑</span>
          Bills
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          B2B invoices grouping one or more delivered orders into a single payable.
        </p>
      </header>

      <BillsList rows={normalized} />
    </div>
  );
}
