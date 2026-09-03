import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRACKER_ROLES, type Role } from "@/lib/roles";
import { AttendanceClient, type AttendanceRow, type Member, type HoursRow } from "./attendance-client";

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

  const [{ data: rows }, { data: members }, hoursRes] = await Promise.all([
    supabase
      .from("attendance")
      .select(
        "id, user_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy, clock_in_far, clock_out_at, clock_out_lat, clock_out_lng, clock_out_accuracy",
      )
      .order("clock_in_at", { ascending: false })
      .limit(200),
    supabase.rpc("list_team_names"),
    canSeeAll ? supabase.rpc("report_attendance_monthly") : Promise.resolve({ data: [] }),
  ]);

  return (
    <AttendanceClient
      currentUserId={user.id}
      canSeeAll={canSeeAll}
      rows={(rows ?? []) as AttendanceRow[]}
      members={(members ?? []) as Member[]}
      hours={(hoursRes.data ?? []) as HoursRow[]}
    />
  );
}
