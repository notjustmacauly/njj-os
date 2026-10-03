import { NextResponse } from "next/server";
import { sendCheckoutEmails } from "./checkout/emails";

/** Second half of every public checkout: place via RPC, email, record the outcome. */
export async function placeAndNotify(
  supabase: Parameters<typeof sendCheckoutEmails>[0],
  rpc: "web_place_checkout" | "web_place_pass_checkout",
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(rpc, { p_payload: payload });
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
