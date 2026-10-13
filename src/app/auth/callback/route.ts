import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles Supabase email links (invite / password recovery / confirm). The
// link carries a one-time ?code which we exchange for a session, then send the
// user on to `next` (default the dashboard; recovery/invite → set-password).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only ever continue to a path on this site (blocks //evil.com and https://…).
  const raw = url.searchParams.get("next") || "/dashboard";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/dashboard";
  const fromAccount = next.startsWith("/account");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Customers go back to the customer sign-in, staff to the staff one.
      const back = fromAccount ? "/account/login" : "/login";
      return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
