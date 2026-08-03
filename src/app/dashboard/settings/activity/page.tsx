import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole, OWNER_ONLY, type Role } from "@/lib/roles";
import { AuditLogView, type AuditRow } from "./audit-log-view";

export const dynamic = "force-dynamic";

export default async function ActivityLogPage() {
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
  const viewerRole = (roleRow?.role as Role | null) ?? null;
  // Audit log is owner-only oversight (matches the audit_log RLS: owner sees
  // every row; other roles would only ever see their own actions).
  if (!hasRole(viewerRole, OWNER_ONLY)) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("audit_log")
    .select(
      "id, occurred_at, actor_id, actor_email, actor_role, action, table_name, row_id, before, after",
    )
    .order("occurred_at", { ascending: false })
    .limit(400);

  // Map actor id → friendly display name.
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, display_name")
    .is("deleted_at", null);
  const nameById: Record<string, string> = {};
  for (const m of (members ?? []) as Array<{ user_id: string; display_name: string }>) {
    nameById[m.user_id] = m.display_name;
  }

  return (
    <AuditLogView rows={(rows ?? []) as AuditRow[]} nameById={nameById} />
  );
}
