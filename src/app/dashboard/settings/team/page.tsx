import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasRole,
  OWNER_PARTNER_MANAGER,
  type Role,
} from "@/lib/roles";
import { TeamPage, type TeamRow } from "./team-page";

export default async function SettingsTeamPage() {
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
  if (!hasRole(viewerRole, OWNER_PARTNER_MANAGER)) redirect("/dashboard");

  // Step 1: read team_members + user_roles via the user's session. RLS allows
  // every-role read of team_members per the migration.
  const { data: members } = await supabase
    .from("team_members")
    .select(
      "user_id, display_name, phone, photo_url, hire_date, status, notes, user_roles!inner(role)",
    )
    .is("deleted_at", null)
    .order("display_name");

  type MemberJoin = {
    user_id: string;
    display_name: string;
    phone: string | null;
    photo_url: string | null;
    hire_date: string | null;
    status: "active" | "inactive" | "on_leave" | string;
    notes: string | null;
    user_roles:
      | { role: Role | string }
      | { role: Role | string }[]
      | null;
  };

  const memberJoins = (members ?? []) as unknown as MemberJoin[];

  // Step 2: use service role (server-only) to fetch each member's email +
  // last_sign_in. If the service-role key isn't configured we degrade
  // gracefully — emails and last-sign-in just render as "—".
  const admin = createAdminClient();
  const emailMap = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
  if (admin) {
    await Promise.all(
      memberJoins.map(async (m) => {
        const { data } = await admin.auth.admin.getUserById(m.user_id);
        emailMap.set(m.user_id, {
          email: data?.user?.email ?? null,
          last_sign_in_at: data?.user?.last_sign_in_at ?? null,
        });
      }),
    );
  }

  const teamRows: TeamRow[] = memberJoins.map((m) => {
    const roleRel = Array.isArray(m.user_roles) ? m.user_roles[0] : m.user_roles;
    const memberRole = (roleRel?.role as Role) ?? "staff";
    const authInfo = emailMap.get(m.user_id);
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      phone: m.phone,
      photo_url: m.photo_url,
      hire_date: m.hire_date,
      status: (m.status as TeamRow["status"]) ?? "active",
      notes: m.notes,
      role: memberRole,
      email: authInfo?.email ?? null,
      last_sign_in_at: authInfo?.last_sign_in_at ?? null,
    };
  });

  const canEdit = viewerRole === "owner";
  const adminAvailable = admin !== null;

  return (
    <TeamPage
      members={teamRows}
      canEdit={canEdit}
      adminApiAvailable={adminAvailable}
    />
  );
}
