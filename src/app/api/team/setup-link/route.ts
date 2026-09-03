import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-only: generate a one-time set-password link for a team member WITHOUT
// sending an email (the owner copies it and sends it however they like). Robust
// against Supabase's flaky/rate-limited default email delivery.
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
  const email = u?.user?.email;
  if (!email) return NextResponse.json({ error: "That member has no email on file." }, { status: 404 });

  const origin = new URL(req.url).origin;
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/auth/set-password` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, link: link.properties?.action_link ?? null, email });
}
