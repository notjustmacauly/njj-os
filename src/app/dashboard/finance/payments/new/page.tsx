import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewPaymentForm } from "./new-payment-form";
import { OWNER_ONLY, type Role } from "@/lib/roles";

// Per matrix: Payments — create is owner-only.
const WRITE_ROLES = OWNER_ONLY;

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "Staff";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function NewPaymentPage() {
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
  if (!role || !WRITE_ROLES.includes(role)) redirect("/dashboard/finance/payments");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("code, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/finance/payments"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to payments
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">💸</span>
          New payment request
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Pending until the owner marks it paid.
        </p>
      </header>

      <NewPaymentForm
        role={role}
        accounts={(accounts ?? []) as Array<{ code: string; name: string }>}
        requestedByName={displayNameFromEmail(user.email ?? "")}
      />
    </div>
  );
}
