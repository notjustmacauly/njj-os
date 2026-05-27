import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OrderDetailClient } from "./order-detail-client";
import type {
  BatchRef,
  PartnerRef,
  SkuRef,
  TierRef,
} from "../order-items-editor";
import type { PartnerOption } from "../new/page";

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const role = roleRow?.role as import("@/lib/roles").Role | null;
  if (!role) redirect("/dashboard");
  // Per matrix: all roles view the order; owner/partner/manager edit;
  // cancel is owner-only.
  const canManage = role === "owner" || role === "partner" || role === "manager";
  const canDelete = role === "owner";

  // Fetch order + everything we need to render + edit it
  const [
    { data: orderData },
    { data: itemsData },
    { data: partnersData },
    { data: tiersData },
    { data: skusData },
    { data: invData },
    { data: accountsData },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, external_id, idempotency_key, order_date, channel, partner_id, partner:partners(id, name, external_id, tier_code, delivery_fee, price_pcl, price_acg, price_wpm), customer_name, event_name, delivery_date, delivery_fee, discount, override_total, subtotal, total, pcl_qty, acg_qty, wpm_qty, payment_status, fulfillment_status, notes, created_at, deleted_at",
      )
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, order_id, sku_code, qty, unit_price, batch_id, batches:batch_id(id, external_id)")
      .eq("order_id", params.id),
    supabase
      .from("partners")
      .select("id, name, external_id, tier_code, delivery_fee, price_pcl, price_acg, price_wpm")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("partner_tiers")
      .select("code, price_pcl, price_acg, price_wpm")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("skus")
      .select("code, name, short_label, retail_price")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("inventory_summary")
      .select("batch_id, batch_external_id, sku_code, remaining, batch_date")
      .gt("remaining", 0)
      .order("batch_date", { ascending: false }),
    supabase
      .from("accounts")
      .select("code, name, is_active")
      .eq("is_active", true)
      .order("code"),
  ]);

  if (!orderData) notFound();

  // Receivable + bill (B2B only path)
  const { data: receivableData } = await supabase
    .from("receivables")
    .select("id, external_id, amount, status, due_date, bill:bills!receivables_bill_id_fkey(id, external_id, status, total, due_date)")
    .eq("order_id", params.id)
    .maybeSingle();

  // Per-item allocations (new multi-batch shape). Empty when delivery
  // happened via the legacy single-batch path on order_items.batch_id.
  const orderItemIds = (itemsData ?? []).map((i) => (i as { id: string }).id);
  const { data: allocData } =
    orderItemIds.length > 0
      ? await supabase
          .from("order_item_batch_allocations")
          .select(
            "id, order_item_id, batch_id, qty, allocated_at, batch:batches!order_item_batch_allocations_batch_id_fkey(id, external_id, batch_date)",
          )
          .in("order_item_id", orderItemIds)
      : { data: [] };

  const allocationsByItemId: Record<
    string,
    Array<{
      batch_id: string;
      batch_external_id: string | null;
      batch_date: string | null;
      qty: number;
    }>
  > = {};
  for (const r of (allocData ?? []) as unknown as Array<{
    order_item_id: string;
    batch_id: string;
    qty: number;
    batch:
      | { id: string; external_id: string | null; batch_date: string }
      | { id: string; external_id: string | null; batch_date: string }[]
      | null;
  }>) {
    const b = Array.isArray(r.batch) ? r.batch[0] : r.batch;
    if (!allocationsByItemId[r.order_item_id]) {
      allocationsByItemId[r.order_item_id] = [];
    }
    allocationsByItemId[r.order_item_id].push({
      batch_id: r.batch_id,
      batch_external_id: b?.external_id ?? null,
      batch_date: b?.batch_date ?? null,
      qty: r.qty,
    });
  }

  const partners = (partnersData ?? []) as PartnerOption[];
  const tiers = (tiersData ?? []) as TierRef[];
  const skus = (skusData ?? []) as SkuRef[];
  const accounts = (accountsData ?? []) as Array<{ code: string; name: string }>;

  const batchesBySku: Record<string, BatchRef[]> = {};
  const deliverBatchesBySku: Record<
    string,
    Array<{ id: string; external_id: string | null; remaining: number; batch_date: string }>
  > = {};
  for (const r of (invData ?? []) as Array<{
    batch_id: string;
    batch_external_id: string;
    sku_code: string;
    remaining: number;
    batch_date: string;
  }>) {
    if (!batchesBySku[r.sku_code]) batchesBySku[r.sku_code] = [];
    batchesBySku[r.sku_code].push({
      id: r.batch_id,
      external_id: r.batch_external_id,
      remaining: r.remaining,
    });
    if (!deliverBatchesBySku[r.sku_code]) deliverBatchesBySku[r.sku_code] = [];
    deliverBatchesBySku[r.sku_code].push({
      id: r.batch_id,
      external_id: r.batch_external_id,
      remaining: r.remaining,
      batch_date: r.batch_date,
    });
  }
  // Make sure currently-assigned batches always appear in their SKU's options
  // even if remaining is 0 (otherwise the picker would show "— no batch —" only).
  for (const it of (itemsData ?? []) as unknown as Array<{
    sku_code: string;
    batch_id: string | null;
    batches: { id: string; external_id: string } | { id: string; external_id: string }[] | null;
  }>) {
    if (!it.batches || !it.batch_id) continue;
    const b = Array.isArray(it.batches) ? it.batches[0] : it.batches;
    if (!b) continue;
    const list = batchesBySku[it.sku_code] ?? (batchesBySku[it.sku_code] = []);
    if (!list.some((x) => x.id === it.batch_id)) {
      list.unshift({ id: b.id, external_id: b.external_id, remaining: 0 });
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/orders"
        className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to orders
      </Link>

      <OrderDetailClient
        order={
          orderData as unknown as {
            id: string;
            external_id: string | null;
            order_date: string;
            channel: "B2B" | "Retail" | "Online" | "Event";
            partner_id: string | null;
            partner: {
              id: string;
              name: string;
              external_id: string | null;
              tier_code: string;
              delivery_fee: number | string | null;
              price_pcl: number | string | null;
              price_acg: number | string | null;
              price_wpm: number | string | null;
            } | null;
            customer_name: string | null;
            event_name: string | null;
            delivery_date: string | null;
            delivery_fee: number | string;
            discount: number | string;
            override_total: number | string | null;
            subtotal: number | string;
            total: number | string;
            pcl_qty: number;
            acg_qty: number;
            wpm_qty: number;
            payment_status: string;
            fulfillment_status: string;
            notes: string | null;
          }
        }
        initialItems={(itemsData ?? []) as unknown as Array<{
          id: string;
          order_id: string;
          sku_code: string;
          qty: number;
          unit_price: number | string;
          batch_id: string | null;
        }>}
        partners={partners}
        tiers={tiers}
        skus={skus}
        batchesBySku={batchesBySku}
        deliverBatchesBySku={deliverBatchesBySku}
        allocationsByItemId={allocationsByItemId}
        accounts={accounts}
        receivable={
          receivableData as unknown as {
            id: string;
            external_id: string | null;
            amount: number | string;
            status: string;
            due_date: string | null;
            bill: {
              id: string;
              external_id: string | null;
              status: string;
              total: number | string;
              due_date: string | null;
            } | null;
          } | null
        }
        canManage={canManage}
        canDelete={canDelete}
      />
    </div>
  );
}
