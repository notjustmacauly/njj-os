import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_ROLES, type Role } from "@/lib/roles";
import { TasksClient, type TaskRow, type Member } from "./tasks-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
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
  if (!role || !TRACKER_ROLES.includes(role)) redirect("/dashboard");

  const [{ data: tasks }, { data: members }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, board, title, description, assigned_by_user_id, assigned_to_user_id, priority, due_date, status, work_link, proposed_caption, post_date, created_at, updated_at",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("list_team_names"),
  ]);

  const canAssign = role === "owner" || role === "partner" || role === "manager";

  return (
    <TasksClient
      currentUserId={user.id}
      canAssign={canAssign}
      tasks={(tasks ?? []) as TaskRow[]}
      members={(members ?? []) as Member[]}
    />
  );
}
