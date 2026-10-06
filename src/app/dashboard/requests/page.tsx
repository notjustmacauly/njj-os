import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { RequestsClient, type MyRequest } from "./requests-client";

export const dynamic = "force-dynamic";

// Submit-only surface for the restricted `marketing` role (Alex & Chrissia).
// They can submit payment + reimbursement requests and see only their own.
export default async function RequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  const role = (roleRow?.role as Role | null) ?? null;
  if (role !== "marketing") redirect("/dashboard");

  const { data: me } = await supabase
    .from("team_members").select("display_name").eq("user_id", user.id).maybeSingle();
  const myName = me?.display_name ?? (user.email?.split("@")[0] ?? "Me");

  const { data: rows } = await supabase
    .from("payments")
    .select("id, type, purpose, payee, amount, status, created_at, paid_date")
    .eq("requested_by_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return <RequestsClient myName={myName} requests={(rows ?? []) as MyRequest[]} />;
}
