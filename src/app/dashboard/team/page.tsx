import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/roles";
import { TeamProfilesClient, type Profile, type Payslip } from "./team-profiles-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  if ((roleRow?.role as Role | null) !== "owner") redirect("/dashboard");

  const { data: members } = await supabase
    .from("team_members")
    .select(
      "user_id, display_name, title, phone, photo_url, hire_date, status, notes, bank_name, account_number, account_name, pay_type, pay_rate, unpaid_break_min, hide_expense_amounts, attendance_supervisor, user_roles!inner(role)",
    )
    .is("deleted_at", null)
    .order("display_name");

  type Row = Omit<Profile, "email" | "role" | "payslips"> & { user_roles: { role: string } | { role: string }[] | null };
  const rows = (members ?? []) as unknown as Row[];

  // Emails via service role (server only).
  const admin = createAdminClient();
  const emailMap = new Map<string, string | null>();
  if (admin) {
    await Promise.all(
      rows.map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        emailMap.set(m.user_id, data?.user?.email ?? null);
      }),
    );
  }

  // Payslips: approved run lines per person.
  const { data: slipRows } = await supabase
    .from("payroll_items")
    .select("share_token, net_amount, user_id, payroll_runs!inner(label, pay_date, status)")
    .not("user_id", "is", null)
    .eq("payroll_runs.status", "approved");
  const slipsByUser = new Map<string, Payslip[]>();
  for (const s of (slipRows ?? []) as unknown as Array<{
    share_token: string; net_amount: number | string; user_id: string;
    payroll_runs: { label: string; pay_date: string } | { label: string; pay_date: string }[];
  }>) {
    const run = Array.isArray(s.payroll_runs) ? s.payroll_runs[0] : s.payroll_runs;
    const list = slipsByUser.get(s.user_id) ?? [];
    list.push({ token: s.share_token, amount: Number(s.net_amount), label: run?.label ?? "", pay_date: run?.pay_date ?? "" });
    slipsByUser.set(s.user_id, list);
  }

  const profiles: Profile[] = rows.map((m) => {
    const rel = Array.isArray(m.user_roles) ? m.user_roles[0] : m.user_roles;
    const slips = (slipsByUser.get(m.user_id) ?? []).sort((a, b) => (a.pay_date < b.pay_date ? 1 : -1));
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      title: m.title,
      phone: m.phone,
      photo_url: m.photo_url,
      hire_date: m.hire_date,
      status: m.status,
      notes: m.notes,
      bank_name: m.bank_name,
      account_number: m.account_number,
      account_name: m.account_name,
      pay_type: m.pay_type,
      pay_rate: m.pay_rate,
      unpaid_break_min: m.unpaid_break_min,
      hide_expense_amounts: m.hide_expense_amounts,
      attendance_supervisor: m.attendance_supervisor,
      email: emailMap.get(m.user_id) ?? null,
      role: (rel?.role as Role) ?? "staff",
      payslips: slips,
    };
  });

  return <TeamProfilesClient profiles={profiles} adminAvailable={admin !== null} />;
}
