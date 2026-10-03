import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRole, OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";
import { sendCheckoutEmails } from "../emails";

export const runtime = "nodejs";

// Staff: resend a website order's confirmation email to the customer and
// report the real error if Gmail refuses it.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!hasRole(roleRow?.role as Role | null, OWNER_PARTNER_MANAGER)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing order." }, { status: 400 });
  const { data: row } = await supabase.from("web_checkouts").select("public_token, customer_email").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  let emailError: string | null = null;
  try {
    await sendCheckoutEmails(supabase, row.public_token, { teamCopy: false });
  } catch (e) {
    emailError = (e as Error).message || "Unknown email error";
  }
  await supabase.rpc("web_mark_checkout_email", { p_token: row.public_token, p_error: emailError });

  if (emailError) return NextResponse.json({ error: `Couldn't send: ${emailError}` }, { status: 502 });
  return NextResponse.json({ sentTo: row.customer_email });
}
