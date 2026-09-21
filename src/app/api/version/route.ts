import { NextResponse } from "next/server";
import { BUILD_ID } from "@/lib/build-id";

// Always served by the live deployment, never cached — so a stale client can
// compare its own baked BUILD_ID against the current one.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { id: BUILD_ID },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
}
