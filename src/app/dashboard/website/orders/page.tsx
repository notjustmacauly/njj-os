import { createClient } from "@/lib/supabase/server";
import { WebOrdersClient, type WebCheckoutRow } from "./orders-client";

export const dynamic = "force-dynamic";

export default async function WebsiteOrdersPage() {
  const supabase = await createClient();
  const [{ data: checkouts }, { data: accounts }] = await Promise.all([
    supabase
      .from("web_checkouts")
      .select(
        "id, kind, event:events(name, event_date), reference, customer_name, customer_email, customer_phone, delivery_address, delivery_notes, first_delivery_date, items, subtotal, delivery_total, total, payment_verification, proof_path, flags, verified_account_code, review_note, reviewed_at, created_at, email_sent_at, email_error",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("accounts").select("code, name").eq("is_active", true).order("code"),
  ]);

  const rows = (checkouts ?? []) as unknown as Omit<WebCheckoutRow, "proof_url" | "orders">[];

  // Screenshots live in a private bucket — sign short-lived links for staff.
  const paths = rows.map((r) => r.proof_path).filter((p): p is string => !!p);
  const signed: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage.from("web-payment-proofs").createSignedUrls(paths, 60 * 60);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
  }

  const ids = rows.map((r) => r.id);
  const ordersBy: Record<string, WebCheckoutRow["orders"]> = {};
  if (ids.length) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, external_id, web_checkout_id, delivery_date, fulfillment_status, total")
      .in("web_checkout_id", ids)
      .order("delivery_date");
    for (const o of (orders ?? []) as Array<WebCheckoutRow["orders"][number] & { web_checkout_id: string }>) {
      (ordersBy[o.web_checkout_id] ??= []).push(o);
    }
  }

  return (
    <WebOrdersClient
      rows={rows.map((r) => ({
        ...r,
        proof_url: r.proof_path ? signed[r.proof_path] ?? null : null,
        orders: ordersBy[r.id] ?? [],
      }))}
      accounts={((accounts ?? []) as Array<{ code: string; name: string }>).filter((a) => a.code !== "Unverified Receipts")}
    />
  );
}
