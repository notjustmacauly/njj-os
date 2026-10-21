import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export type ProofUpload = {
  supabase: SupabaseClient;
  payload: Record<string, unknown>;
  path: string | null;
  sha: string | null;
};

/**
 * Shared first half of every public checkout: parse the multipart body and
 * put the payment screenshot into the private web-payment-proofs bucket as
 * anon (insert-only). Returns either the upload or an error response.
 */
export async function receiveProof(req: Request, opts: { optional?: boolean } = {}): Promise<ProofUpload | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Checkout isn't configured." }, { status: 500 });

  let form: FormData;
  let payload: Record<string, unknown>;
  try {
    form = await req.formData();
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const proof = form.get("proof");
  const supabaseAnon = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  // Wallet-only bookings have nothing to pay, so no screenshot (the RPC still
  // insists on one whenever there's money owed).
  if (opts.optional && !(proof instanceof File && proof.size > 0)) return { supabase: supabaseAnon, payload, path: null, sha: null };
  if (!(proof instanceof File) || proof.size === 0) {
    return NextResponse.json({ error: "Please upload your payment screenshot." }, { status: 400 });
  }
  if (proof.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is over 10 MB. Send a smaller screenshot." }, { status: 400 });
  }
  const ext = EXT[proof.type];
  if (!ext) return NextResponse.json({ error: "Please upload a JPG or PNG screenshot." }, { status: 400 });

  const supabase = supabaseAnon;
  const bytes = Buffer.from(await proof.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("web-payment-proofs")
    .upload(path, bytes, { contentType: proof.type, upsert: false });
  if (error) return NextResponse.json({ error: "We couldn't save your screenshot. Try again." }, { status: 502 });

  return { supabase, payload, path, sha };
}
