import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FinanceSubNav } from "./sub-nav";

type Role = "admin" | "manager" | "ops" | "staff";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
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
  // Staff get into Finance only via reimbursements; the inner pages still
  // role-gate per-route. Don't redirect here so the per-page redirect logic
  // owns the rules.

  return (
    <div className="space-y-6">
      {role ? <FinanceSubNav role={role} /> : null}
      {children}
    </div>
  );
}
