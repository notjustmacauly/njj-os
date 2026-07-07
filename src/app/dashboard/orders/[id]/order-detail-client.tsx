"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatPHP } from "@/lib/utils";
import {
  newDraft,
  OrderItemsEditor,
  resolveUnitPrice,
  type BatchRef,
  type OrderItemDraft,
  type PartnerRef,
  type SkuRef,
  type TierRef,
} from "../order-items-editor";
import type { PartnerOption } from "../new/page";
import { DeliverOrderModal, type DeliverBatchOption } from "./deliver-order-modal";

type OrderRecord = {
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
    pays_on_delivery: boolean | null;
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
};

type ItemRow = {
  id: string;
  order_id: string;
  sku_code: string;
  qty: number;
  unit_price: number | string;
  batch_id: string | null;
};

type Receivable = {
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
};

const CHANNEL_TONE = {
  B2B: "peri",
  Online: "berry",
  Retail: "yellow",
  Event: "coral",
} as const;

function toDraft(it: ItemRow): OrderItemDraft {
  return {
    tempId: it.id,
    id: it.id,
    sku_code: it.sku_code,
    qty: Number(it.qty),
    unit_price: Number(it.unit_price),
    batch_id: it.batch_id,
  };
}

export function OrderDetailClient({
  order,
  initialItems,
  partners,
  tiers,
  skus,
  batchesBySku,
  deliverBatchesBySku,
  allocationsByItemId,
  accounts,
  receivable,
  canManage,
  canDelete,
  canOverrideDelivery,
}: {
  order: OrderRecord;
  initialItems: ItemRow[];
  partners: PartnerOption[];
  tiers: TierRef[];
  skus: SkuRef[];
  batchesBySku: Record<string, BatchRef[]>;
  deliverBatchesBySku: Record<string, DeliverBatchOption[]>;
  allocationsByItemId: Record<
    string,
    Array<{ batch_id: string; batch_external_id: string | null; batch_date: string | null; qty: number }>
  >;
  accounts: Array<{ code: string; name: string }>;
  receivable: Receivable | null;
  canManage: boolean;
  canDelete: boolean;
  canOverrideDelivery: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const partner: PartnerRef | null = order.partner
    ? {
        id: order.partner.id,
        tier_code: order.partner.tier_code,
        price_pcl: order.partner.price_pcl,
        price_acg: order.partner.price_acg,
        price_wpm: order.partner.price_wpm,
      }
    : null;

  // ── Items state ──────────────────────────────────────────────
  const initialDrafts = React.useMemo(
    () => initialItems.map(toDraft),
    [initialItems],
  );
  const [items, setItems] = React.useState<OrderItemDraft[]>(initialDrafts);
  const [savingItems, setSavingItems] = React.useState(false);

  const itemsDirty =
    items.length !== initialDrafts.length ||
    items.some((it) => {
      const prev = initialDrafts.find((d) => d.id === it.id);
      if (!prev) return true; // new line
      return (
        prev.sku_code !== it.sku_code ||
        prev.qty !== it.qty ||
        Number(prev.unit_price) !== Number(it.unit_price) ||
        (prev.batch_id ?? null) !== (it.batch_id ?? null)
      );
    });

  async function saveItems() {
    if (!canManage || !itemsDirty || savingItems) return;
    setSavingItems(true);
    const supabase = createClient();

    const initialIds = new Set(initialDrafts.map((d) => d.id));
    const currentIds = new Set(items.filter((i) => i.id).map((i) => i.id!));
    const removed = initialDrafts.filter((d) => d.id && !currentIds.has(d.id));
    const added = items.filter((i) => !i.id);
    const updated = items.filter((i) => {
      if (!i.id || !initialIds.has(i.id)) return false;
      const prev = initialDrafts.find((d) => d.id === i.id)!;
      return (
        prev.sku_code !== i.sku_code ||
        prev.qty !== i.qty ||
        Number(prev.unit_price) !== Number(i.unit_price) ||
        (prev.batch_id ?? null) !== (i.batch_id ?? null)
      );
    });

    try {
      // Remove first, so SKU swaps don't collide on the unique (order_id, sku_code) constraint
      if (removed.length > 0) {
        const { error } = await supabase
          .from("order_items")
          .delete()
          .in("id", removed.map((d) => d.id!));
        if (error) throw error;
      }
      for (const u of updated) {
        const { error } = await supabase
          .from("order_items")
          .update({
            sku_code: u.sku_code,
            qty: u.qty,
            unit_price: u.unit_price,
            batch_id: u.batch_id,
          })
          .eq("id", u.id!);
        if (error) throw error;
      }
      if (added.length > 0) {
        const { error } = await supabase.from("order_items").insert(
          added.map((a) => ({
            order_id: order.id,
            sku_code: a.sku_code,
            qty: a.qty,
            unit_price: a.unit_price,
            batch_id: a.batch_id,
          })),
        );
        if (error) throw error;
      }
      toast.push("Items saved", "success");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't save items";
      toast.push(msg, "error");
    } finally {
      setSavingItems(false);
    }
  }

  function resetItems() {
    setItems(initialDrafts.map((d) => ({ ...d })));
  }

  // ── Header / metadata state ─────────────────────────────────
  const [orderDate, setOrderDate] = React.useState(order.order_date);
  const [deliveryDate, setDeliveryDate] = React.useState(order.delivery_date ?? "");
  const [deliveryFee, setDeliveryFee] = React.useState(String(Number(order.delivery_fee)));
  const [discount, setDiscount] = React.useState(String(Number(order.discount)));
  const [overrideTotal, setOverrideTotal] = React.useState(
    order.override_total != null ? String(Number(order.override_total)) : "",
  );
  const [customerName, setCustomerName] = React.useState(order.customer_name ?? "");
  const [eventName, setEventName] = React.useState(order.event_name ?? "");
  const [notes, setNotes] = React.useState(order.notes ?? "");
  const [savingMeta, setSavingMeta] = React.useState(false);

  const metaDirty =
    orderDate !== order.order_date ||
    (deliveryDate || null) !== (order.delivery_date || null) ||
    Number(deliveryFee) !== Number(order.delivery_fee) ||
    Number(discount) !== Number(order.discount) ||
    (overrideTotal === "" ? null : Number(overrideTotal)) !==
      (order.override_total == null ? null : Number(order.override_total)) ||
    customerName !== (order.customer_name ?? "") ||
    eventName !== (order.event_name ?? "") ||
    notes !== (order.notes ?? "");

  async function saveMeta() {
    if (!canManage || !metaDirty || savingMeta) return;
    setSavingMeta(true);
    const supabase = createClient();
    const overrideNum = overrideTotal.trim() === "" ? null : Number(overrideTotal);
    const { error } = await supabase
      .from("orders")
      .update({
        order_date: orderDate,
        delivery_date: deliveryDate || null,
        delivery_fee: Number(deliveryFee) || 0,
        discount: Number(discount) || 0,
        override_total: overrideNum != null && Number.isFinite(overrideNum) ? overrideNum : null,
        customer_name: customerName.trim() || null,
        event_name: order.channel === "Event" ? eventName.trim() || null : null,
        notes: notes.trim() || null,
      })
      .eq("id", order.id);
    setSavingMeta(false);
    if (error) {
      toast.push(error.message || "Couldn't save", "error");
      return;
    }
    toast.push("Order saved", "success");
    router.refresh();
  }

  // ── Status dialogs ──────────────────────────────────────────
  const [fulfillmentOpen, setFulfillmentOpen] = React.useState(false);
  const [deliverOpen, setDeliverOpen] = React.useState(false);
  const [paidOpen, setPaidOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState(false);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  async function softDelete() {
    setBusyAction(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusyAction(false);
    setConfirmDelete(false);
    if (error) {
      toast.push(error.message || "Couldn't delete order", "error");
      return;
    }
    toast.push("Order deleted", "success");
    router.push("/dashboard/orders");
    router.refresh();
  }

  // Live total preview (for the items pane)
  const subtotalLive = items.reduce((s, it) => s + it.qty * Number(it.unit_price), 0);
  const overrideNum = overrideTotal.trim() === "" ? null : Number(overrideTotal);
  const computedLive =
    subtotalLive + (Number(deliveryFee) || 0) - (Number(discount) || 0);
  const totalLive =
    overrideNum != null && Number.isFinite(overrideNum) ? overrideNum : computedLive;

  // What action buttons to show
  const showUpdateFulfillment =
    canManage && order.fulfillment_status !== "Delivered" && order.fulfillment_status !== "Cancelled";
  const showDeliver = showUpdateFulfillment && items.length > 0;
  // Non-B2B can be marked paid any time. B2B can be marked paid directly only
  // when the partner is flagged pays-on-delivery AND the order is delivered
  // (its receivable exists by then); otherwise B2B stays on the bill flow.
  const isCod = order.channel === "B2B" && !!order.partner?.pays_on_delivery;
  const showMarkPaid =
    canManage &&
    order.payment_status !== "Paid" &&
    (order.channel !== "B2B" || (isCod && order.fulfillment_status === "Delivered"));

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                {order.external_id ?? "—"}
              </span>
              <span className="text-inkSoft">·</span>
              <h2 className="font-serif font-bold text-2xl text-ink truncate">
                {order.partner?.name ?? order.customer_name ?? "Walk-in"}
              </h2>
              <Badge tone={CHANNEL_TONE[order.channel]}>{order.channel}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-inkSoft">
              <span>{formatDate(order.order_date)}</span>
              {order.delivery_date ? (
                <>
                  <span>·</span>
                  <span>delivery {formatDate(order.delivery_date)}</span>
                </>
              ) : null}
              <span>·</span>
              <span>{order.pcl_qty + order.acg_qty + order.wpm_qty} cans</span>
              <span>·</span>
              <span className="font-semibold text-berry">{formatPHP(order.total)}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                Fulfillment
              </span>
              <StatusBadge status={order.fulfillment_status} />
              <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft ml-3">
                Payment
              </span>
              <StatusBadge status={order.payment_status} />
            </div>
          </div>

          {canDelete ? (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className="p-1.5 rounded-md hover:bg-cream text-inkSoft hover:text-ink"
                aria-label="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 mt-1 w-44 bg-white border border-border rounded-md shadow-card py-1 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-coral hover:bg-salmonBg"
                  >
                    <Trash2 className="w-4 h-4" />
                    Soft-delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {(showUpdateFulfillment || showMarkPaid) && (
          <div className="border-t border-border bg-cream/50 px-5 py-3 flex gap-2 flex-wrap">
            {showDeliver ? (
              <Button variant="primary" size="sm" onClick={() => setDeliverOpen(true)}>
                Deliver order…
              </Button>
            ) : null}
            {showUpdateFulfillment ? (
              <Button variant="ghost" size="sm" onClick={() => setFulfillmentOpen(true)}>
                Update fulfillment
              </Button>
            ) : null}
            {showMarkPaid ? (
              <Button variant="berryGhost" size="sm" onClick={() => setPaidOpen(true)}>
                Mark paid
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-serif font-bold text-xl text-ink">Line items</h3>
            {itemsDirty ? (
              <span className="text-xs text-yellow font-semibold">Unsaved changes</span>
            ) : null}
          </div>
          <OrderItemsEditor
            items={items}
            onChange={setItems}
            skus={skus}
            tiers={tiers}
            partner={partner}
            batchesBySku={batchesBySku}
            disabled={!canManage || savingItems}
          />

          <div className="border-t border-border pt-4">
            <dl className="space-y-2 text-sm max-w-sm ml-auto">
              <div className="flex justify-between">
                <dt className="text-inkSoft">Subtotal</dt>
                <dd className="font-mono">{formatPHP(subtotalLive)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-inkSoft">Delivery</dt>
                <dd className="font-mono">{formatPHP(Number(deliveryFee) || 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-inkSoft">Discount</dt>
                <dd className="font-mono">−{formatPHP(Number(discount) || 0)}</dd>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <dt className="font-semibold text-ink">
                  {overrideNum != null && Number.isFinite(overrideNum) ? "Override total" : "Total"}
                </dt>
                <dd className="font-serif font-bold text-2xl text-berry">
                  {formatPHP(totalLive)}
                </dd>
              </div>
              {overrideNum != null && Number.isFinite(overrideNum) ? (
                <div className="flex justify-between text-xs text-inkSoft">
                  <dt>Computed</dt>
                  <dd className="font-mono">{formatPHP(computedLive)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {canManage ? (
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetItems}
                disabled={!itemsDirty || savingItems}
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={saveItems}
                disabled={!itemsDirty || savingItems}
              >
                {savingItems ? "Saving…" : "Save items"}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Metadata */}
        <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
          <h3 className="font-serif font-bold text-xl text-ink">Order details</h3>

          <div className="space-y-1">
            <Label>Channel</Label>
            <div className="text-sm text-ink py-2">{order.channel}</div>
            <p className="text-xs text-inkSoft">
              Channel can&apos;t be changed after creation.
            </p>
          </div>

          {order.partner ? (
            <div className="space-y-1">
              <Label>Partner</Label>
              <div className="text-sm font-semibold text-ink py-2">
                {order.partner.name}{" "}
                <span className="text-xs text-inkSoft font-normal">
                  ({order.partner.external_id})
                </span>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="order_date" required>
              Order date
            </Label>
            <DateInput
              id="order_date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="delivery_date">Delivery date</Label>
            <DateInput
              id="delivery_date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          {order.channel !== "B2B" ? (
            <div className="space-y-1">
              <Label htmlFor="customer_name">Customer name</Label>
              <Input
                id="customer_name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={!canManage || savingMeta}
              />
            </div>
          ) : null}

          {order.channel === "Event" ? (
            <div className="space-y-1">
              <Label htmlFor="event_name" required>
                Event name
              </Label>
              <Input
                id="event_name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                disabled={!canManage || savingMeta}
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="delivery_fee" required>
              Delivery fee
            </Label>
            <NumberInput
              id="delivery_fee"
              prefix="₱"
              min="0"
              step="1"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="discount">Discount</Label>
            <NumberInput
              id="discount"
              prefix="₱"
              min="0"
              step="1"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="override_total">Override total</Label>
            <NumberInput
              id="override_total"
              prefix="₱"
              min="0"
              step="1"
              value={overrideTotal}
              onChange={(e) => setOverrideTotal(e.target.value)}
              placeholder="auto-computed"
              disabled={!canManage || savingMeta}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canManage || savingMeta}
            />
          </div>

          {canManage ? (
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                size="sm"
                onClick={saveMeta}
                disabled={!metaDirty || savingMeta}
              >
                {savingMeta ? "Saving…" : "Save details"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Delivery breakdown — visible when delivered or any allocations exist */}
      {order.fulfillment_status === "Delivered" || Object.keys(allocationsByItemId).length > 0 ? (
        <DeliveryBreakdown
          items={initialItems}
          allocationsByItemId={allocationsByItemId}
        />
      ) : null}

      {/* Linked records */}
      {receivable ? <LinkedRecords receivable={receivable} /> : null}

      {/* Modals */}
      <DeliverOrderModal
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        orderId={order.id}
        externalId={order.external_id}
        items={initialItems.map((it) => ({
          id: it.id,
          sku_code: it.sku_code,
          qty: it.qty,
        }))}
        batchesBySku={deliverBatchesBySku}
        canOverride={canOverrideDelivery}
        onDelivered={() => {
          // Deliver & collect: for orders payable directly (non-B2B, or a
          // pays-on-delivery partner) that aren't paid yet, jump straight to
          // collecting payment once delivery succeeds.
          if (
            order.payment_status !== "Paid" &&
            (order.channel !== "B2B" || order.partner?.pays_on_delivery)
          ) {
            setPaidOpen(true);
          }
        }}
      />
      <FulfillmentModal
        open={fulfillmentOpen}
        onClose={() => setFulfillmentOpen(false)}
        order={order}
      />
      <MarkPaidModal
        open={paidOpen}
        onClose={() => setPaidOpen(false)}
        order={order}
        accounts={accounts}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Soft-delete this order?"
        description={`Order ${order.external_id ?? ""} will be hidden from lists. Audit trail is preserved.`}
        confirmLabel="Delete order"
        destructive
        busy={busyAction}
        onConfirm={softDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ── DeliveryBreakdown ─────────────────────────────────────────
function DeliveryBreakdown({
  items,
  allocationsByItemId,
}: {
  items: ItemRow[];
  allocationsByItemId: Record<
    string,
    Array<{ batch_id: string; batch_external_id: string | null; batch_date: string | null; qty: number }>
  >;
}) {
  const hasAnyAllocations = items.some(
    (it) => (allocationsByItemId[it.id] ?? []).length > 0,
  );
  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-6">
      <h3 className="font-serif font-bold text-xl text-ink mb-3">
        Delivery breakdown
      </h3>
      {!hasAnyAllocations ? (
        <p className="text-xs text-inkSoft mb-3">
          Legacy single-batch delivery (one batch per line item).
        </p>
      ) : null}
      <ul className="space-y-3">
        {items.map((it) => {
          const allocs = allocationsByItemId[it.id] ?? [];
          if (allocs.length === 0) {
            return (
              <li key={it.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-ink">{it.sku_code}</span>
                  <span className="text-inkSoft">×</span>
                  <span className="font-mono">{it.qty}</span>
                  <span className="text-inkSoft">·</span>
                  {it.batch_id ? (
                    <Link
                      href={`/dashboard/production/${it.batch_id}`}
                      className="font-mono text-xs text-berry hover:underline"
                    >
                      from one batch (legacy)
                    </Link>
                  ) : (
                    <span className="text-xs text-inkSoft">no batch assigned</span>
                  )}
                </div>
              </li>
            );
          }
          return (
            <li key={it.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-ink">{it.sku_code}</span>
                <span className="text-inkSoft">×</span>
                <span className="font-mono">{it.qty}</span>
                <span className="text-inkSoft text-xs">
                  ({allocs.length} {allocs.length === 1 ? "batch" : "batches"})
                </span>
              </div>
              <ul className="ml-4 mt-1 space-y-0.5">
                {allocs.map((a) => (
                  <li
                    key={a.batch_id}
                    className="flex items-baseline gap-2 text-xs"
                  >
                    <Link
                      href={`/dashboard/production/${a.batch_id}`}
                      className="font-mono text-berry hover:underline"
                    >
                      {a.batch_external_id ?? a.batch_id.slice(0, 8)}
                    </Link>
                    {a.batch_date ? (
                      <span className="text-inkSoft">{a.batch_date}</span>
                    ) : null}
                    <span className="text-inkSoft">·</span>
                    <span className="font-mono">{a.qty} cans</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── LinkedRecords ─────────────────────────────────────────────
function LinkedRecords({ receivable }: { receivable: Receivable }) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-6">
      <h3 className="font-serif font-bold text-xl text-ink mb-3">Linked records</h3>
      <ul className="text-sm space-y-2">
        <li className="flex items-center gap-2 flex-wrap">
          <span className="text-inkSoft">Receivable:</span>
          <span className="font-mono text-xs">{receivable.external_id ?? "—"}</span>
          <span className="font-semibold text-berry">{formatPHP(receivable.amount)}</span>
          <StatusBadge status={receivable.status} />
        </li>
        {receivable.bill ? (
          <li className="flex items-center gap-2 flex-wrap">
            <span className="text-inkSoft">Bill:</span>
            <Link
              href={`/dashboard/finance/bills/${receivable.bill.id}`}
              className="font-mono text-xs text-berry hover:underline"
            >
              {receivable.bill.external_id ?? "—"}
            </Link>
            <span className="font-semibold text-berry">{formatPHP(receivable.bill.total)}</span>
            <StatusBadge status={receivable.bill.status} />
            {receivable.bill.due_date ? (
              <span className="text-xs text-inkSoft">
                due {formatDate(receivable.bill.due_date)}
              </span>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

// ── FulfillmentModal ──────────────────────────────────────────
function FulfillmentModal({
  open,
  onClose,
  order,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderRecord;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = React.useState(order.fulfillment_status);
  const [deliveryDate, setDeliveryDate] = React.useState(order.delivery_date ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStatus(order.fulfillment_status);
      setDeliveryDate(order.delivery_date ?? "");
    }
  }, [open, order.fulfillment_status, order.delivery_date]);

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const update: Record<string, unknown> = { fulfillment_status: status };
    if ((deliveryDate || null) !== (order.delivery_date || null)) {
      update.delivery_date = deliveryDate || null;
    }
    const { error } = await supabase.from("orders").update(update).eq("id", order.id);
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't update", "error");
      return;
    }
    toast.push("Fulfillment updated", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update fulfillment"
      description={`For order ${order.external_id ?? ""}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="fstatus">Status</Label>
          <Select id="fstatus" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Pending">Pending</option>
            <option value="Packed">Packed</option>
            <option value="Cancelled">Cancelled</option>
          </Select>
          <p className="text-xs text-inkSoft">
            To mark this order Delivered, close this and use the “Deliver order” button —
            that path lets you pick which batches the cans come from.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fdate">Delivery date</Label>
          <DateInput
            id="fdate"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

// ── MarkPaidModal ─────────────────────────────────────────────
function MarkPaidModal({
  open,
  onClose,
  order,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderRecord;
  accounts: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [accountCode, setAccountCode] = React.useState(accounts[0]?.code ?? "");
  const [amount, setAmount] = React.useState(String(Number(order.total)));
  const [paidDate, setPaidDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAccountCode(accounts[0]?.code ?? "");
      setAmount(String(Number(order.total)));
      setPaidDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, accounts, order.total]);

  async function save() {
    if (!accountCode) {
      toast.push("Pick an account", "error");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.push("Amount must be > 0", "error");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // B2B (pays-on-delivery) settles the auto-created receivable; everyone
    // else posts directly against the order.
    const rpc = order.channel === "B2B" ? "mark_order_paid_cod" : "mark_order_paid";
    const { error } = await supabase.rpc(rpc, {
      p_order_id: order.id,
      p_account_code: accountCode,
      p_amount: amt,
      p_paid_date: paidDate,
    });
    setBusy(false);
    if (error) {
      toast.push(error.message || "Couldn't mark paid", "error");
      return;
    }
    toast.push("Marked paid — ledger updated", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark order paid"
      description={`For order ${order.external_id ?? ""}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Mark paid"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="paccount" required>
            Receiving account
          </Label>
          <Select
            id="paccount"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pamount" required>
            Amount
          </Label>
          <NumberInput
            id="pamount"
            prefix="₱"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-inkSoft">
            Defaults to order total ({formatPHP(order.total)}).
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdate">Paid date</Label>
          <DateInput
            id="pdate"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
