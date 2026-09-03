import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["owner", "partner", "manager", "staff", "marketing"];

// Owner-only: create a team member account with a TEMPORARY password (no email,
// so it isn't affected by Supabase's email rate limit), assign the role, and
// create the profile. Returns the temp password for the owner to share.
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

  const body = (await req.json().catch(() => ({}))) as { email?: string; displayName?: string; role?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim();
  const role = (body.role ?? "").trim();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Pick a role." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY isn't set on this deploy. Add it in Netlify env + redeploy." },
      { status: 503 },
    );
  }

  const tempPassword = "NJJ-" + randomBytes(9).toString("base64url").replace(/[-_]/g, "").slice(0, 10);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createErr) {
    const msg = /already been registered|already registered|already exists/i.test(createErr.message)
      ? "That email already has an account. Open them in the Team list and use “Set temporary password” instead."
      : createErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const newUserId = created.user?.id;
  if (!newUserId) return NextResponse.json({ error: "Account created but no id returned." }, { status: 500 });

  const { error: rErr } = await admin
    .from("user_roles")
    .upsert({ user_id: newUserId, role }, { onConflict: "user_id" });
  if (rErr) return NextResponse.json({ error: `Account created, but assigning the role failed: ${rErr.message}` }, { status: 500 });

  const { error: tErr } = await admin
    .from("team_members")
    .upsert({ user_id: newUserId, display_name: displayName, status: "active" }, { onConflict: "user_id" });
  if (tErr) return NextResponse.json({ error: `Account + role created, but the profile failed: ${tErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, email, tempPassword });
}
