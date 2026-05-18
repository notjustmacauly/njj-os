import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ReceiveForm, type IngredientOption } from "./receive-form";
import { hasRole, OWNER_PARTNER, type Role } from "@/lib/roles";

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "Staff";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function ReceiveSuppliesPage({
  searchParams,
}: {
  searchParams?: { ingredient?: string };
}) {
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
  // Per matrix: only owner/partner can record receipts (it posts to ledger).
  if (!hasRole(role, OWNER_PARTNER)) redirect("/dashboard/inventory");

  const [{ data: ingredientsData }, { data: accountsData }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("code, name, unit, type")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("accounts")
      .select("code, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to inventory
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">📥</span>
          Log received supplies
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Creates a new lot and posts a matching outflow to the selected account.
        </p>
      </header>

      <ReceiveForm
        ingredients={(ingredientsData ?? []) as IngredientOption[]}
        accounts={(accountsData ?? []) as Array<{ code: string; name: string }>}
        defaultIngredientCode={searchParams?.ingredient ?? null}
        receivedByName={displayNameFromEmail(user.email ?? "")}
      />
    </div>
  );
}
