import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { ReimbursementsList, type ReimbursementRow } from "./reimbursements-list";
import { ALL_ROLES, type Role } from "@/lib/roles";

// Staff sees only their own — RLS does the row filtering.
const READ_ROLES = ALL_ROLES;

export default async function ReimbursementsPage() {
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

  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - 12);
  windowStart.setDate(1);

  const [{ data: accounts }, { data: payments }] = await Promise.all([
    supabase.from("accounts").select("code, name").eq("is_active", true).order("name"),
    supabase
      .from("payments")
      .select(
        "id, external_id, created_at, type, purpose, payee, category, amount, account_code, status, paid_date, requested_by_name, notes",
      )
      .eq("type", "reimbursement")
      .is("deleted_at", null)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">🤝</span>
            Reimbursements
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Money back to team members who paid out of pocket for the business.
          </p>
        </div>
        <Link href="/dashboard/finance/reimbursements/new" className={buttonClasses()}>
          <Plus className="w-4 h-4" />
          New reimbursement
        </Link>
      </header>

      <ReimbursementsList
        role={role}
        accounts={(accounts ?? []) as Array<{ code: string; name: string }>}
        initial={(payments ?? []) as ReimbursementRow[]}
      />
    </div>
  );
}
