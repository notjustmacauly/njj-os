import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RevenueTable, type RevenueEntry } from "./revenue-table";

type Role = "admin" | "manager" | "ops" | "staff";
const FINANCE_ROLES: Role[] = ["admin", "manager", "ops"];

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

  const [{ data: accounts }, { data: entries }] = await Promise.all([
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
  ]);

  const accountNameByCode: Record<string, string> = {};
  for (const a of (accounts ?? []) as Array<{ code: string; name: string }>) {
    accountNameByCode[a.code] = a.name;
  }

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
          <span aria-hidden className="mr-2">💰</span>
          Revenue
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          All inbound ledger entries — POS shifts, paid orders, bills, tickets, manual adjustments.
        </p>
      </header>

      <RevenueTable
        entries={(entries ?? []) as RevenueEntry[]}
        accountNameByCode={accountNameByCode}
      />
    </div>
  );
}
