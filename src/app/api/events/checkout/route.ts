import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { receiveProof } from "../../shop/proof";
import { placeAndNotify } from "../../shop/place";

export const runtime = "nodejs";

// Public event-pass checkout (and 4-pass bundle purchases). web_place_pass_checkout
// checks capacity and creates one ticket (with its own QR token) per pass.
// Signed-in members call it with their session so it can use their pass wallet.
export async function POST(req: Request) {
  const up = await receiveProof(req, { optional: true });
  if (up instanceof NextResponse) return up;
  const server = await createServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return placeAndNotify(user ? server : up.supabase, "web_place_pass_checkout", {
    ...up.payload,
    proof_path: up.path,
    proof_sha256: up.sha,
  });
}
