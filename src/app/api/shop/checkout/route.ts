import { NextResponse } from "next/server";
import { receiveProof } from "../proof";
import { placeAndNotify } from "../place";

export const runtime = "nodejs";

// Public shop checkout. web_place_checkout re-prices the cart, checks stock
// and creates the orders server-side.
export async function POST(req: Request) {
  const up = await receiveProof(req);
  if (up instanceof NextResponse) return up;
  return placeAndNotify(up.supabase, "web_place_checkout", { ...up.payload, proof_path: up.path, proof_sha256: up.sha });
}
