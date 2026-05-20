import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewReimbursementForm } from "./new-reimbursement-form";
import { ALL_ROLES, type Role } from "@/lib/roles";

// All roles can submit reimbursements (staff sees / edits their own only,
// enforced by RLS).
const WRITE_ROLES = ALL_ROLES;

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "Staff";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function NewReimbursementPage() {
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
  if (!role || !WRITE_ROLES.includes(role)) redirect("/dashboard/finance/reimbursements");

  // No allowed-accounts fetch — reimbursements no longer collect an account
  // at submit time; the payer picks one at pay time.
  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("user_id, display_name")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("display_name");

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/finance/reimbursements"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to reimbursements
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">🤝</span>
          Request reimbursement
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Pay back a team member who bought something for the business. Mac or Hanneh
          chooses the source account when they pay this out.
        </p>
      </header>

      <NewReimbursementForm
        teamMembers={(teamMembers ?? []) as Array<{ user_id: string; display_name: string }>}
        requestedByName={displayNameFromEmail(user.email ?? "")}
      />
    </div>
  );
}
