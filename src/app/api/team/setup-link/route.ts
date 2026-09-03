import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only: set a TEMPORARY password for a team member via the admin API and
// return it, so the owner can share it directly. This sends no email at all,
// so it isn't affected by Supabase's email rate limit ("email limit reached").
// The member logs in with it, then can change it at /auth/set-password.
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
    return NextResponse.json({ error: "Only the owner can do this." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { user_id?: string };
  const targetId = (body.user_id ?? "").trim();
  if (!targetId) return NextResponse.json({ error: "Missing user." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY isn't set on this deploy. Add it in Netlify env + redeploy." },
      { status: 503 },
    );
  }

  const { data: u } = await admin.auth.admin.getUserById(targetId);
  const email = u?.user?.email ?? null;

  // Readable temp password: letters + digits, ~14 chars, prefixed for clarity.
  const tempPassword = "NJJ-" + randomBytes(9).toString("base64url").replace(/[-_]/g, "").slice(0, 10);

  const { error } = await admin.auth.admin.updateUserById(targetId, {
    password: tempPassword,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, tempPassword, email });
}
