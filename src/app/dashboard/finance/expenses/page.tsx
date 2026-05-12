import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExpensesView, type ExpenseRow } from "./expenses-view";

type Role = "admin" | "manager" | "ops" | "staff";
const READ_ROLES: Role[] = ["admin", "manager", "ops"];

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "Staff";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function ExpensesPage() {
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

  const canManage = role === "admin" || role === "manager";

  // 18-month rolling window.
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - 18);
  windowStart.setDate(1);

  const [{ data: accounts }, { data: expenses }] = await Promise.all([
    supabase
      .from("accounts")
      .select("code, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("expenses")
      .select(
        "id, external_id, expense_date, category, description, vendor, amount, account_code, payment_ref, receipt_url, notes, voided_at, void_reason, logged_by_name, created_at",
      )
      .is("deleted_at", null)
      .gte("expense_date", windowStart.toISOString().slice(0, 10))
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const accountList = (accounts ?? []) as Array<{ code: string; name: string }>;

  return (
    <ExpensesView
      role={role as "admin" | "manager" | "ops"}
      canManage={canManage}
      defaultLoggedByName={displayNameFromEmail(user.email ?? "")}
      accounts={accountList}
      expenses={(expenses ?? []) as ExpenseRow[]}
    />
  );
}
