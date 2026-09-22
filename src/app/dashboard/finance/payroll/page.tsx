import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { PayrollClient, type Run, type Item, type PayMember, type PayPerson, type Advance } from "./payroll-client";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
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
  const role = (roleRow?.role as Role | null) ?? null;
  // Payroll is owner-only (confidential — not even partner).
  if (role !== "owner") redirect("/dashboard");

  const [{ data: runs }, { data: members }, { data: people }, { data: accounts }] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select(
        "id, period_start, period_end, pay_date, label, status, account_code, total_amount, created_at, approved_at, void_reason",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("team_members")
      .select("user_id, display_name, title, pay_type, pay_rate, unpaid_break_min, status")
      .is("deleted_at", null)
      .order("display_name"),
    supabase
      .from("payroll_people")
      .select("id, name, pay_type, default_amount, default_rate, email, active")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name"),
    supabase.from("accounts").select("code, name").order("code"),
  ]);

  const runList = (runs ?? []) as Run[];
  const runIds = runList.map((r) => r.id);
  const [{ data: itemRows }, { data: advanceRows }] = await Promise.all([
    runIds.length
      ? supabase
          .from("payroll_items")
          .select("id, run_id, user_id, person_id, name, pay_type, rate, hours, base_amount, overtime_pay, bonuses, tax, philhealth, sss, pagibig, absences, other_deductions, advance_repayment, advance_id, net_amount, account_code, breakdown, share_token, payslip_emailed_at, payslip_period_start, payslip_period_end")
          .in("run_id", runIds)
      : Promise.resolve({ data: [] as Item[] }),
    supabase.rpc("list_cash_advances"),
  ]);

  return (
    <PayrollClient
      runs={runList}
      items={(itemRows ?? []) as Item[]}
      members={((members ?? []) as PayMember[]).filter((m) => (m.status ?? "active") === "active")}
      people={(people ?? []) as PayPerson[]}
      accounts={(accounts ?? []) as Array<{ code: string; name: string }>}
      advances={(advanceRows ?? []) as Advance[]}
    />
  );
}
