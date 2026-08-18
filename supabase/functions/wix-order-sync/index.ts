// Wix → OS order sync.
//
// Receives a webhook when a Wix order is placed/paid, fetches the full order
// via the Wix eCommerce API, maps its pack line-items to our cans (PCL/ACG/WPM)
// using wix_product_map, then creates an Online order, marks it paid to Xendit,
// and delivers it (FIFO) to deduct the cans. Idempotent on the Wix order number.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   WIX_API_KEY          – Wix account API key with "Read Orders"
//   WIX_SITE_ID          – (optional) defaults to the NotJust store id
//   WIX_ACCOUNT_ID       – (optional) account id, if the API key requires it
//   WIX_WEBHOOK_SECRET   – shared secret; sent as ?secret= or x-webhook-secret
//   WIX_PAYMENT_ACCOUNT  – (optional) defaults to "Xendit"
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WIX_API_KEY = Deno.env.get("WIX_API_KEY")!;
const WIX_SITE_ID = Deno.env.get("WIX_SITE_ID") ?? "cf21e2f8-9dac-46a2-b7e0-916ed89e891b";
const WIX_ACCOUNT_ID = Deno.env.get("WIX_ACCOUNT_ID") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WIX_WEBHOOK_SECRET") ?? "";
const PAYMENT_ACCOUNT = Deno.env.get("WIX_PAYMENT_ACCOUNT") ?? "Xendit";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_KEY);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isoDate(d?: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function wixHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: WIX_API_KEY,
    "wix-site-id": WIX_SITE_ID,
    "Content-Type": "application/json",
  };
  if (WIX_ACCOUNT_ID) h["wix-account-id"] = WIX_ACCOUNT_ID;
  return h;
}

async function wixGetOrder(orderId: string): Promise<any> {
  const r = await fetch(`https://www.wixapis.com/ecom/v1/orders/${orderId}`, { headers: wixHeaders() });
  const j = await r.json();
  if (!r.ok) throw new Error(`wix get order ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j.order;
}
async function wixSearchByNumber(number: string): Promise<any | null> {
  const r = await fetch("https://www.wixapis.com/ecom/v1/orders/search", {
    method: "POST",
    headers: wixHeaders(),
    body: JSON.stringify({ search: { filter: { number: { $eq: String(number) } }, cursorPaging: { limit: 1 } } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`wix search ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return (j.orders ?? [])[0] ?? null;
}

// Pull an order id (GUID) or number out of whatever webhook shape Wix sends.
function extractRef(body: any): { id?: string; number?: string } {
  const flat: string[] = [];
  const walk = (o: any, depth: number) => {
    if (!o || depth > 6) return;
    if (typeof o === "string") { flat.push(o); return; }
    if (typeof o === "object") for (const v of Object.values(o)) walk(v, depth + 1);
  };
  const idKeys = ["orderId", "entityId", "id", "_id"];
  const numKeys = ["orderNumber", "number"];
  const find = (obj: any, keys: string[]): string | undefined => {
    let hit: string | undefined;
    const w = (o: any, d: number) => {
      if (!o || d > 6 || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (keys.includes(k) && (typeof v === "string" || typeof v === "number")) { hit ??= String(v); }
        else w(v, d + 1);
      }
    };
    w(obj, 0);
    return hit;
  };
  walk(body, 0);
  const id = flat.find((s) => GUID.test(s)) ?? find(body, idKeys);
  const number = find(body, numKeys);
  return { id: id && GUID.test(id) ? id : undefined, number };
}

// "1x Pineapple - 1x Apple - 2x Watermelon" -> { PCL:1, ACG:1, WPM:2 } (per pack)
function parseFlavors(text: string, map: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /(\d+)\s*x\s*([a-zA-Z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    const sku = map[m[2].toLowerCase()];
    if (sku && n > 0) out[sku] = (out[sku] ?? 0) + n;
  }
  return out;
}

async function notifyOwner(title: string, message: string) {
  try {
    await db.rpc("notify", {
      p_type: "wix_sync",
      p_title: title,
      p_message: message,
      p_link: "/dashboard/orders",
      p_recipient_role: "owner",
    });
  } catch (_e) { /* best-effort */ }
}

async function processOrder(order: any): Promise<Response> {
  if (order.paymentStatus !== "PAID") {
    return Response.json({ skipped: "not paid", number: order.number });
  }

  const { data: mapRows } = await db
    .from("wix_product_map")
    .select("wix_product_id, sku_code, cans_per_unit, flavor_breakdown")
    .eq("is_active", true);
  const pmap = new Map<string, any>();
  for (const r of mapRows ?? []) pmap.set(r.wix_product_id, r);

  const acc: Record<string, { qty: number; total: number }> = {};
  const add = (sku: string, cans: number, total: number) => {
    const e = acc[sku] ?? { qty: 0, total: 0 };
    e.qty += cans; e.total += total; acc[sku] = e;
  };
  const unknown: string[] = [];

  for (const li of order.lineItems ?? []) {
    const catId = li.catalogReference?.catalogItemId ?? li.rootCatalogItemId;
    const packs = Number(li.quantity ?? 1);
    const lineTotal = Number(li.totalPriceAfterTax?.amount ?? Number(li.price?.amount ?? 0) * packs);
    const m = catId ? pmap.get(catId) : null;
    if (!m) { unknown.push(li.productName?.original ?? catId ?? "unknown"); continue; }

    if (m.sku_code) {
      const cans = packs * Number(m.cans_per_unit ?? 0);
      if (cans > 0) add(m.sku_code, cans, lineTotal);
    } else if (m.flavor_breakdown?.parse === "option_text") {
      const flavorText =
        li.catalogReference?.options?.options?.Flavor ??
        (li.descriptionLines ?? []).map((d: any) => d.plainText?.original ?? d.plainTextValue?.original).join(" ");
      const perPack = parseFlavors(flavorText ?? "", m.flavor_breakdown.map ?? {});
      const cansPerPack = Object.values(perPack).reduce((a, b) => a + b, 0);
      if (cansPerPack === 0) { unknown.push(`${li.productName?.original} (unparsed: ${flavorText})`); continue; }
      const totalCans = cansPerPack * packs;
      const perCan = totalCans > 0 ? lineTotal / totalCans : 0;
      for (const [sku, n] of Object.entries(perPack)) add(sku, n * packs, round2(perCan * n * packs));
    }
  }

  if (unknown.length > 0) {
    await notifyOwner(
      `Wix order #${order.number} needs mapping`,
      `Unmapped product(s): ${unknown.join(", ")}. Add them to wix_product_map, then it can be re-imported.`,
    );
    return Response.json({ error: "unmapped products", products: unknown, number: order.number }, { status: 200 });
  }

  const items = Object.entries(acc).map(([sku, e]) => ({
    sku_code: sku,
    qty: e.qty,
    unit_price: round2(e.total / e.qty),
  }));
  if (items.length === 0) return Response.json({ skipped: "no items", number: order.number });

  const orderDate = isoDate(order.purchasedDate ?? order.createdDate);
  const deliveryDate = isoDate(order.shippingInfo?.logistics?.deliveryTimeSlot?.to) ?? orderDate;
  const c = order.billingInfo?.contactDetails ?? order.recipientInfo?.contactDetails ?? {};
  const customerName = [c.firstName, c.lastName].filter(Boolean).join(" ") || order.buyerInfo?.email || "Wix customer";
  const city = order.shippingInfo?.logistics?.shippingDestination?.address?.city ?? "";
  const notes = `Wix #${order.number} · ${order.buyerInfo?.email ?? ""}${city ? " · " + city : ""}`;

  const { data: oid, error: coErr } = await db.rpc("create_order", {
    p_idempotency_key: `wix-${order.number}`,
    p_channel: "Online",
    p_partner_id: null,
    p_customer_name: customerName,
    p_event_name: null,
    p_order_date: orderDate,
    p_delivery_date: deliveryDate,
    p_delivery_fee: Number(order.priceSummary?.shipping?.amount ?? 0),
    p_discount: Number(order.priceSummary?.discount?.amount ?? 0),
    p_override_total: null,
    p_notes: notes,
    p_items: items,
  });
  if (coErr) throw new Error("create_order: " + coErr.message);

  // Mark paid (idempotent) to the online payment account.
  const { error: payErr } = await db.rpc("mark_order_paid", {
    p_order_id: oid,
    p_account_code: PAYMENT_ACCOUNT,
    p_paid_date: orderDate,
  });
  if (payErr) console.error("mark_order_paid:", payErr.message);

  // Deliver (deduct cans FIFO) unless already delivered.
  const { data: ord } = await db.from("orders").select("fulfillment_status").eq("id", oid).maybeSingle();
  if (ord?.fulfillment_status !== "Delivered") {
    const { error: delErr } = await db.rpc("deliver_order", {
      p_order_id: oid,
      p_allocations: [],
      p_allow_override: false,
      p_delivery_date: deliveryDate,
    });
    if (delErr) {
      console.error("deliver_order:", delErr.message);
      await notifyOwner(
        `Wix order #${order.number} imported but not delivered`,
        `Created & paid, but couldn't deduct cans: ${delErr.message}. Deliver it manually once stock is available.`,
      );
    }
  }

  return Response.json({ ok: true, wix: order.number, os_order: oid, items });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch { /* may be empty */ }

  try {
    const ref = extractRef(body);
    let order: any = null;
    if (ref.id) order = await wixGetOrder(ref.id);
    else if (ref.number) order = await wixSearchByNumber(ref.number);
    if (!order) {
      console.log("no order ref in payload:", JSON.stringify(body).slice(0, 500));
      return new Response("no order reference", { status: 200 });
    }
    return await processOrder(order);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("wix-order-sync error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
});
