import { NextResponse } from "next/server";
import { receiveProof } from "../../shop/proof";
import { placeAndNotify } from "../../shop/place";

export const runtime = "nodejs";

// Public event-pass checkout. web_place_pass_checkout checks capacity and
// creates one ticket (with its own QR token) per pass.
export async function POST(req: Request) {
  const up = await receiveProof(req);
  if (up instanceof NextResponse) return up;
  return placeAndNotify(up.supabase, "web_place_pass_checkout", { ...up.payload, proof_path: up.path, proof_sha256: up.sha });
}
