import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RevenueTable, type RevenueEntry } from "./revenue-table";
import { LogRevenueLauncher } from "./log-revenue-launcher";
import {
  StandaloneRevenueEntries,
  type StandaloneRevenueRow,
} from "./standalone-entries";
import { OWNER_PARTNER, type Role } from "@/lib/roles";

const FINANCE_ROLES = OWNER_PARTNER;

function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function RevenuePage() {
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

  // 18-month look-back window; client-side filters narrow within that.
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - 18);
  windowStart.setDate(1);

  const [
    { data: accounts },
    { data: entries },
    { data: standaloneRows },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("code, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("ledger_entries")
      .select(
        "id, occurred_at, account_code, direction, amount, ref_type, ref_id, ref_external_id, description",
      )
      .eq("direction", "in")
      .gte("occurred_at", windowStart.toISOString())
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("revenue_entries")
      .select(
        "id, external_id, revenue_date, category, description, amount, account_code, notes, logged_by_name, voided_at, void_reason",
      )
      .is("deleted_at", null)
      .order("revenue_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const accountList = (accounts ?? []) as Array<{ code: string; name: string }>;
  const accountNameByCode: Record<string, string> = {};
  for (const a of accountList) {
    accountNameByCode[a.code] = a.name;
  }

  const standalone: StandaloneRevenueRow[] = ((standaloneRows ?? []) as Array<{
    id: string;
    external_id: string | null;
    revenue_date: string;
    category: StandaloneRevenueRow["category"];
    description: string;
    amount: number | string;
    account_code: string;
    notes: string | null;
    logged_by_name: string | null;
    voided_at: string | null;
    void_reason: string | null;
  }>).map((r) => ({
    id: r.id,
    external_id: r.external_id,
    revenue_date: r.revenue_date,
    category: r.category,
    description: r.description,
    amount: Number(r.amount ?? 0),
    account_code: r.account_code,
    notes: r.notes,
    logged_by_name: r.logged_by_name,
    voided_at: r.voided_at,
    void_reason: r.void_reason,
  }));

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif font-bold text-3xl text-ink">
              <span aria-hidden className="mr-2">💰</span>
              Revenue
            </h1>
            <p className="text-sm text-inkSoft mt-1">
              All inbound ledger entries — POS shifts, paid orders, bills,
              tickets, standalone revenue, manual adjustments.
            </p>
          </div>
          <LogRevenueLauncher
            accounts={accountList}
            loggedByName={displayNameFromEmail(user.email)}
          />
        </div>
      </header>

      <RevenueTable
        entries={(entries ?? []) as RevenueEntry[]}
        accountNameByCode={accountNameByCode}
      />

      <StandaloneRevenueEntries
        rows={standalone}
        accountNameByCode={accountNameByCode}
        role={role}
      />
    </div>
  );
}
