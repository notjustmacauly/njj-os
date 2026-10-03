import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sendCheckoutEmails } from "./emails";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// Public checkout. Runs as anon: the screenshot goes into the private
// web-payment-proofs bucket (insert-only for anon), then web_place_checkout
// re-prices the cart, checks stock and creates the orders server-side.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Checkout isn't configured." }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(String(form.get("payload") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const proof = form.get("proof");
  if (!(proof instanceof File) || proof.size === 0) {
    return NextResponse.json({ error: "Please upload your payment screenshot." }, { status: 400 });
  }
  if (proof.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is over 10 MB — please send a smaller screenshot." }, { status: 400 });
  }
  const ext = EXT[proof.type];
  if (!ext) {
    return NextResponse.json({ error: "Please upload a JPG or PNG screenshot." }, { status: 400 });
  }

  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  const bytes = Buffer.from(await proof.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("web-payment-proofs")
    .upload(path, bytes, { contentType: proof.type, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: "We couldn't save your screenshot — please try again." }, { status: 502 });
  }

  const { data, error } = await supabase.rpc("web_place_checkout", {
    p_payload: { ...payload, proof_path: path, proof_sha256: sha },
  });
  if (error) {
    // 22023 = our own validation messages, safe to show the shopper.
    const msg = error.code === "22023" ? error.message : "Something went wrong placing your order — please try again.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const result = data as { reference: string; token: string; replayed?: boolean };
  if (!result.replayed) {
    // Email never blocks the order, but the outcome is recorded so a failure
    // shows (with a Resend button) in Website studio → Orders.
    let emailError: string | null = null;
    try {
      await sendCheckoutEmails(supabase, result.token);
    } catch (e) {
      emailError = (e as Error).message || "Unknown email error";
      console.error("checkout email failed", result.reference, emailError);
    }
    await supabase.rpc("web_mark_checkout_email", { p_token: result.token, p_error: emailError });
  }

  return NextResponse.json({ reference: result.reference, token: result.token });
}
