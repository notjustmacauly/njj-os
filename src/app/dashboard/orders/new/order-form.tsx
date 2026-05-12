"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";
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
import type { PartnerOption } from "./page";

type Channel = "B2B" | "Retail" | "Online" | "Event";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPartnerRef(p: PartnerOption | undefined): PartnerRef | null {
  if (!p) return null;
  return {
    id: p.id,
    tier_code: p.tier_code,
    price_pcl: p.price_pcl,
    price_acg: p.price_acg,
    price_wpm: p.price_wpm,
  };
}

export function NewOrderForm({
  partners,
  tiers,
  skus,
  batchesBySku,
}: {
  partners: PartnerOption[];
  tiers: TierRef[];
  skus: SkuRef[];
  batchesBySku: Record<string, BatchRef[]>;
}) {
  const router = useRouter();
  const toast = useToast();

  // One idempotency key per page-mount; survives re-renders, fresh on hard reload.
  const idempotencyKey = React.useMemo(() => crypto.randomUUID(), []);

  const [channel, setChannel] = React.useState<Channel>("B2B");
  const [partnerId, setPartnerId] = React.useState<string>("");
  const [customerName, setCustomerName] = React.useState("");
  const [eventName, setEventName] = React.useState("");
  const [orderDate, setOrderDate] = React.useState(todayIso());
  const [deliveryDate, setDeliveryDate] = React.useState("");
  const [deliveryFee, setDeliveryFee] = React.useState<string>("0");
  const [discount, setDiscount] = React.useState<string>("0");
  const [overrideTotal, setOverrideTotal] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [items, setItems] = React.useState<OrderItemDraft[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const partner = toPartnerRef(partners.find((p) => p.id === partnerId));

  // Initialize one default line item when SKUs become available
  React.useEffect(() => {
    if (items.length === 0 && skus.length > 0) {
      setItems([newDraft(skus[0].code, partner, tiers, skus)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When partner changes, refill delivery_fee + recompute item prices to defaults
  function onPartnerChange(newId: string) {
    setPartnerId(newId);
    const p = partners.find((x) => x.id === newId);
    if (p) {
      setDeliveryFee(String(Number(p.delivery_fee ?? 0)));
      const newPartner = toPartnerRef(p);
      setItems((prev) =>
        prev.map((it) => ({
          ...it,
          unit_price: resolveUnitPrice({
            skuCode: it.sku_code,
            partner: newPartner,
            tiers,
            skus,
          }),
        })),
      );
    }
  }

  function onChannelChange(next: Channel) {
    setChannel(next);
    if (next !== "B2B") setPartnerId("");
    if (next !== "Event") setEventName("");
    // Recompute prices using the (now possibly null) partner
    const nextPartner = next === "B2B" ? partner : null;
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        unit_price: resolveUnitPrice({
          skuCode: it.sku_code,
          partner: nextPartner,
          tiers,
          skus,
        }),
      })),
    );
  }

  // Live total preview
  const subtotal = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const dFee = Number(deliveryFee) || 0;
  const disc = Number(discount) || 0;
  const computedTotal = subtotal + dFee - disc;
  const overrideNum =
    overrideTotal.trim() === "" ? null : Number(overrideTotal);
  const finalTotal = overrideNum != null && Number.isFinite(overrideNum) ? overrideNum : computedTotal;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!orderDate) e.order_date = "Required";
    if (channel === "B2B" && !partnerId) e.partner_id = "Pick a partner";
    if ((channel === "Retail" || channel === "Event") && !customerName.trim())
      e.customer_name = "Required for this channel";
    if (channel === "Event" && !eventName.trim())
      e.event_name = "Required for events";
    if (Number(deliveryFee) < 0 || !Number.isFinite(Number(deliveryFee)))
      e.delivery_fee = "Must be ≥ 0";
    if (discount && (Number(discount) < 0 || !Number.isFinite(Number(discount))))
      e.discount = "Must be ≥ 0";
    if (overrideTotal && (Number(overrideTotal) < 0 || !Number.isFinite(Number(overrideTotal))))
      e.override_total = "Must be ≥ 0";
    if (items.length === 0) e.items = "Add at least one line item";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) {
      toast.push("Please fix the highlighted fields", "error");
      return;
    }
    setSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_order", {
      p_idempotency_key: idempotencyKey,
      p_channel: channel,
      p_partner_id: channel === "B2B" ? partnerId : null,
      p_customer_name: customerName.trim() || null,
      p_event_name: channel === "Event" ? eventName.trim() : null,
      p_order_date: orderDate,
      p_delivery_date: deliveryDate || null,
      p_delivery_fee: dFee,
      p_discount: disc,
      p_override_total: overrideNum != null && Number.isFinite(overrideNum) ? overrideNum : null,
      p_notes: notes.trim() || null,
      p_items: items.map((it) => ({
        sku_code: it.sku_code,
        qty: it.qty,
        unit_price: it.unit_price,
        batch_id: it.batch_id || null,
      })),
    });

    setSubmitting(false);

    if (error) {
      toast.push(error.message || "Couldn't create order", "error");
      return;
    }
    if (!data) {
      toast.push("Order created but no ID returned", "error");
      return;
    }

    toast.push("Order created", "success");
    router.push(`/dashboard/orders/${data as string}`);
    router.refresh();
  }

  const partnerOptions = partners.map((p) => ({
    value: p.id,
    label: p.name,
    hint: p.external_id ?? "",
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-6">
        <h2 className="font-serif font-bold text-xl text-ink">Order details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="order_date" required>
              Order date
            </Label>
            <DateInput
              id="order_date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              disabled={submitting}
            />
            {errors.order_date ? (
              <p className="text-xs text-coral mt-1">{errors.order_date}</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="channel" required>
              Channel
            </Label>
            <Select
              id="channel"
              value={channel}
              onChange={(e) => onChannelChange(e.target.value as Channel)}
              disabled={submitting}
            >
              <option value="B2B">B2B</option>
              <option value="Retail">Retail</option>
              <option value="Online">Online</option>
              <option value="Event">Event</option>
            </Select>
          </div>

          {channel === "B2B" ? (
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="partner" required>
                Partner
              </Label>
              <Combobox
                ariaLabel="Partner"
                value={partnerId}
                onChange={onPartnerChange}
                options={partnerOptions}
                placeholder="Search a B2B partner…"
                emptyMessage="No active partners"
                disabled={submitting}
              />
              {errors.partner_id ? (
                <p className="text-xs text-coral mt-1">{errors.partner_id}</p>
              ) : null}
            </div>
          ) : null}

          {channel !== "B2B" ? (
            <div className="space-y-1">
              <Label htmlFor="customer_name" required={channel === "Retail" || channel === "Event"}>
                Customer name
              </Label>
              <Input
                id="customer_name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in"
                disabled={submitting}
              />
              {errors.customer_name ? (
                <p className="text-xs text-coral mt-1">{errors.customer_name}</p>
              ) : null}
            </div>
          ) : null}

          {channel === "Event" ? (
            <div className="space-y-1">
              <Label htmlFor="event_name" required>
                Event name
              </Label>
              <Input
                id="event_name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                disabled={submitting}
              />
              {errors.event_name ? (
                <p className="text-xs text-coral mt-1">{errors.event_name}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="delivery_date">Delivery date</Label>
            <DateInput
              id="delivery_date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              disabled={submitting}
            />
          </div>

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
              disabled={submitting}
            />
            {errors.delivery_fee ? (
              <p className="text-xs text-coral mt-1">{errors.delivery_fee}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif font-bold text-xl text-ink">Line items</h2>
          {errors.items ? (
            <span className="text-xs text-coral">{errors.items}</span>
          ) : null}
        </div>
        <OrderItemsEditor
          items={items}
          onChange={setItems}
          skus={skus}
          tiers={tiers}
          partner={partner}
          batchesBySku={batchesBySku}
          disabled={submitting}
        />
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card p-6 space-y-4">
        <h2 className="font-serif font-bold text-xl text-ink">Adjustments</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="discount">Discount</Label>
            <NumberInput
              id="discount"
              prefix="₱"
              min="0"
              step="1"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={submitting}
            />
            {errors.discount ? (
              <p className="text-xs text-coral mt-1">{errors.discount}</p>
            ) : null}
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
              disabled={submitting}
            />
            <p className="text-xs text-inkSoft">
              Empty = use computed total. Set only to manually override.
            </p>
            {errors.override_total ? (
              <p className="text-xs text-coral mt-1">{errors.override_total}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card p-6">
        <h2 className="font-serif font-bold text-xl text-ink mb-4">Total</h2>
        <dl className="space-y-2 text-sm max-w-sm">
          <div className="flex justify-between">
            <dt className="text-inkSoft">Subtotal</dt>
            <dd className="font-mono">{formatPHP(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-inkSoft">Delivery</dt>
            <dd className="font-mono">{formatPHP(dFee)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-inkSoft">Discount</dt>
            <dd className="font-mono">−{formatPHP(disc)}</dd>
          </div>
          <div className="border-t border-border pt-2 flex justify-between">
            <dt className="font-semibold text-ink">
              {overrideNum != null && Number.isFinite(overrideNum) ? "Override total" : "Total"}
            </dt>
            <dd className="font-serif font-bold text-2xl text-berry">
              {formatPHP(finalTotal)}
            </dd>
          </div>
          {overrideNum != null && Number.isFinite(overrideNum) ? (
            <div className="flex justify-between text-xs text-inkSoft">
              <dt>Computed</dt>
              <dd className="font-mono">{formatPHP(computedTotal)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create order"}
        </Button>
      </div>
    </form>
  );
}
