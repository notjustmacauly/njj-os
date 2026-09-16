import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/roles";
import { TeamProfilesClient, type Profile, type Payslip, type Incident, type Hours, type TaskStats } from "./team-profiles-client";

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
      "user_id, display_name, title, phone, photo_url, hire_date, status, notes, bank_name, account_number, account_name, sss_no, philhealth_no, tin_no, pagibig_no, pay_type, pay_rate, unpaid_break_min, hide_expense_amounts, attendance_supervisor",
    )
    .is("deleted_at", null)
    .order("display_name");

  type Row = Omit<Profile, "email" | "role" | "payslips" | "hours" | "incidents">;
  const rows = (members ?? []) as unknown as Row[];

  // Roles as a separate query — team_members has no direct FK to user_roles,
  // so an embed is brittle. Map by user_id instead.
  const { data: roleRows } = await supabase.from("user_roles").select("user_id, role");
  const roleMap = new Map<string, Role>();
  for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) roleMap.set(r.user_id, r.role as Role);

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

  // Hours worked summary (owner-only RPC).
  const { data: hoursRows } = await supabase.rpc("team_hours_summary");
  const hoursByUser = new Map<string, Hours>();
  for (const h of (hoursRows ?? []) as Array<{ user_id: string; month_minutes: number; total_minutes: number; shifts: number; last_shift: string | null }>) {
    hoursByUser.set(h.user_id, { month_minutes: h.month_minutes, total_minutes: h.total_minutes, shifts: h.shifts, last_shift: h.last_shift });
  }

  // Task stats per person (owner-only RPC).
  const { data: statRows } = await supabase.rpc("team_task_stats");
  const statsByUser = new Map<string, TaskStats>();
  for (const s of (statRows ?? []) as Array<{ user_id: string; open_count: number; completed_count: number; completed_dated: number; ontime_count: number; overdue_open: number }>) {
    statsByUser.set(s.user_id, {
      open: s.open_count, completed: s.completed_count, completed_dated: s.completed_dated,
      ontime: s.ontime_count, overdue_open: s.overdue_open,
    });
  }

  // HR / incident log.
  const { data: incRows } = await supabase
    .from("hr_incidents")
    .select("id, user_id, kind, title, details, occurred_on, severity")
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false });
  const incByUser = new Map<string, Incident[]>();
  for (const i of (incRows ?? []) as Incident[]) {
    const list = incByUser.get(i.user_id) ?? [];
    list.push(i);
    incByUser.set(i.user_id, list);
  }

  const profiles: Profile[] = rows.map((m) => {
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
      sss_no: m.sss_no,
      philhealth_no: m.philhealth_no,
      tin_no: m.tin_no,
      pagibig_no: m.pagibig_no,
      pay_type: m.pay_type,
      pay_rate: m.pay_rate,
      unpaid_break_min: m.unpaid_break_min,
      hide_expense_amounts: m.hide_expense_amounts,
      attendance_supervisor: m.attendance_supervisor,
      email: emailMap.get(m.user_id) ?? null,
      role: roleMap.get(m.user_id) ?? "staff",
      payslips: slips,
      hours: hoursByUser.get(m.user_id) ?? null,
      incidents: incByUser.get(m.user_id) ?? [],
      taskStats: statsByUser.get(m.user_id) ?? null,
    };
  });

  return <TeamProfilesClient profiles={profiles} adminAvailable={admin !== null} />;
}
