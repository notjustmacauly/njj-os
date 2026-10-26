import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_ROLES, type Role } from "@/lib/roles";
import { TasksClient, type TaskRow, type Member, type TaskTemplate } from "./tasks-client";

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

  // Marketing (Chrissia, Alex) can now create + assign tasks; managers+ can also
  // manage anyone's tasks and set up recurring templates.
  const canAssign = role === "owner" || role === "partner" || role === "manager" || role === "marketing";
  const canManageAll = role === "owner" || role === "partner" || role === "manager";

  const [{ data: tasks }, { data: members }, templatesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, board, title, description, assigned_by_user_id, assigned_to_user_id, priority, due_date, status, work_link, proposed_caption, post_date, brand, is_private, acknowledged_at, completed_at, deleted_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false }),
    supabase.rpc("list_team_names"),
    canManageAll
      ? supabase
          .from("task_templates")
          .select("id, board, title, description, assigned_to_user_id, priority, cadence, weekday, day_of_month, lead_days, active")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <TasksClient
      currentUserId={user.id}
      canAssign={canAssign}
      canManageAll={canManageAll}
      tasks={(tasks ?? []) as TaskRow[]}
      members={(members ?? []) as Member[]}
      templates={(templatesRes.data ?? []) as TaskTemplate[]}
    />
  );
}
