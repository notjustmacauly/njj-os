import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["owner", "partner", "manager", "staff", "marketing"];

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (roleRow?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can invite members." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    displayName?: string;
    role?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim();
  const role = (body.role ?? "").trim();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Pick a role." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY isn't set on this deploy. Add it in Netlify env + redeploy to enable in-app invites." },
      { status: 503 },
    );
  }

  const origin = new URL(req.url).origin;
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/set-password`,
  });
  if (inviteErr) {
    const msg = /already been registered|already registered/i.test(inviteErr.message)
      ? "That email already has an account. They can use “Forgot / set password” on the login page instead."
      : inviteErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const newUserId = invite.user?.id;
  if (!newUserId) return NextResponse.json({ error: "Invite sent but no user id was returned." }, { status: 500 });

  const { error: rErr } = await admin
    .from("user_roles")
    .upsert({ user_id: newUserId, role }, { onConflict: "user_id" });
  if (rErr) return NextResponse.json({ error: `Invite sent, but assigning the role failed: ${rErr.message}` }, { status: 500 });

  const { error: tErr } = await admin
    .from("team_members")
    .upsert({ user_id: newUserId, display_name: displayName, status: "active" }, { onConflict: "user_id" });
  if (tErr) return NextResponse.json({ error: `Invite sent + role set, but the profile failed: ${tErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, email });
}
