import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { hasRole, OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { PayeesManager, type PayeeRow } from "./payees-manager";

// Manage the shared payee/vendor directory that feeds the pickers on
// Payments, Expenses, and Releases.
export default async function PayeesPage() {
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
  if (!hasRole(role, OWNER_PARTNER_MANAGER)) redirect("/dashboard/finance");

  const { data } = await supabase
    .from("payees")
    .select("id, name, is_active")
    .is("deleted_at", null)
    .order("name");
  const payees = (data ?? []) as PayeeRow[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
          <Users className="w-7 h-7 text-berry" />
          Payees
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          The shared list that powers the payee/vendor pickers on Payments, Expenses, and
          Releases. New names you type on a transaction are added here automatically — clean up
          duplicates or typos below.
        </p>
      </header>

      {payees.length === 0 ? (
        <EmptyState
          emoji="🧾"
          title="No payees yet"
          description="Names will appear here as you record payments, expenses, and releases — or add one now."
        />
      ) : null}

      <PayeesManager payees={payees} />
    </div>
  );
}
