import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_ROLES, type Role } from "@/lib/roles";
import { AttendanceClient, type AttendanceRow, type Member } from "./attendance-client";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
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

  const canSeeAll = role === "owner" || role === "partner" || role === "manager";

  const [{ data: rows }, { data: members }] = await Promise.all([
    supabase
      .from("attendance")
      .select(
        "id, user_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy, clock_out_at, clock_out_lat, clock_out_lng, clock_out_accuracy",
      )
      .order("clock_in_at", { ascending: false })
      .limit(200),
    supabase.rpc("list_team_names"),
  ]);

  return (
    <AttendanceClient
      currentUserId={user.id}
      canSeeAll={canSeeAll}
      rows={(rows ?? []) as AttendanceRow[]}
      members={(members ?? []) as Member[]}
    />
  );
}
