"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, History, ShoppingCart, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonClasses } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/components/ui/toast";
import { cn, formatPHP } from "@/lib/utils";
import { BundlePicker } from "./bundle-picker";
import { CartItem as CartItemRow } from "./cart-item";
import { CloseShiftDialog } from "./close-shift-dialog";
import { CupFlavorPicker } from "./cup-flavor-picker";
import { PaymentMethodToggle } from "./payment-method-toggle";
import { SKU_EMOJI, type PaymentMethod } from "./pricing";
import { ProductButton } from "./product-button";
import { SessionSummary } from "./session-summary";
import type {
  ActiveShift,
  CartItem,
  PosBundleRef,
  PosItemType,
  PosProductRef,
  Role,
  SkuRef,
  TicketTypeRef,
} from "./types";

type Flavor = "PCL" | "ACG" | "WPM";

// Map a pos_products row to the cart's item_type enum. Only CUP_SM / CUP_LG /
// WATER get dedicated maintained-column tracking on pos_transactions; anything
// else (rentals, merch, new codes) falls into 'other'.
function itemTypeForProduct(code: string): PosItemType {
  if (code === "CUP_SM") return "cup_sm";
  if (code === "CUP_LG") return "cup_lg";
  if (code === "WATER") return "water";
  return "other";
}

// Display order for grouping products on the POS grid.
const CATEGORY_ORDER = ["cup", "water", "rental", "merch", "other"];
const CATEGORY_LABEL: Record<string, string> = {
  cup: "Cups",
  water: "Water",
  rental: "Rentals",
  merch: "Merch",
  other: "Other",
};
const CATEGORY_TONE: Record<string, "yellow" | "peri" | "berry" | "coral" | "default"> = {
  cup: "yellow",
  water: "peri",
  rental: "berry",
  merch: "coral",
  other: "default",
};

type Tab = "juice" | "tickets";

function newCartItemId(): string {
  return crypto.randomUUID();
}

export function ActivePosClient({
  shift,
  skus,
  ticketTypes,
  posProducts,
  bundles,
  viewerRole,
}: {
  shift: ActiveShift;
  skus: SkuRef[];
  ticketTypes: TicketTypeRef[];
  posProducts: PosProductRef[];
  bundles: PosBundleRef[];
  viewerRole: Role;
}) {
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = React.useState<Tab>("juice");
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [discount, setDiscount] = React.useState("0");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod | null>(null);
  const [cashTendered, setCashTendered] = React.useState("");
  const [idempotencyKey, setIdempotencyKey] = React.useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = React.useState(false);
  const [showCloseDialog, setShowCloseDialog] = React.useState(false);
  const [cashOnHand, setCashOnHand] = React.useState<number>(Number(shift.opening_cash ?? 0));
  const [mobileCartOpen, setMobileCartOpen] = React.useState(false);

  // Close the mobile cart drawer after a successful charge so the user
  // sees the toast + a clean product grid for the next sale.
  // (Triggered by the cart-clearing side-effect of handleCharge.)
  React.useEffect(() => {
    if (cart.length === 0 && mobileCartOpen) setMobileCartOpen(false);
  }, [cart.length, mobileCartOpen]);

  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (!mobileCartOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileCartOpen]);

  // Close on Escape — mirrors the global nav drawer behavior.
  React.useEffect(() => {
    if (!mobileCartOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileCartOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileCartOpen]);

  const subtotal = cart.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);

  const cashNum = cashTendered === "" ? null : Number(cashTendered);
  const cashValid = cashNum !== null && Number.isFinite(cashNum) && cashNum >= total;
  const change = cashNum !== null && Number.isFinite(cashNum) ? cashNum - total : 0;

  const canCharge =
    !submitting &&
    cart.length > 0 &&
    paymentMethod !== null &&
    (paymentMethod !== "Cash" || cashValid);

  const skuByCode = React.useMemo(() => {
    const m: Record<string, SkuRef> = {};
    for (const s of skus) m[s.code] = s;
    return m;
  }, [skus]);

  const batchForSku = React.useCallback(
    (code: "PCL" | "ACG" | "WPM"): string | undefined => {
      if (code === "PCL") return shift.default_batch_pcl ?? undefined;
      if (code === "ACG") return shift.default_batch_acg ?? undefined;
      if (code === "WPM") return shift.default_batch_wpm ?? undefined;
      return undefined;
    },
    [shift],
  );

  function addJuice(code: Flavor, qty = 1) {
    const sku = skuByCode[code];
    if (!sku) return;
    const price = Number(sku.retail_price ?? 0);
    if (price <= 0) {
      toast.push(`${code} has no retail price set`, "error");
      return;
    }
    addJuiceRow({
      code,
      qty,
      unit_price: price,
      label: code,
      emoji: SKU_EMOJI[code],
    });
  }

  // Add a juice row with explicit label + unit_price + optional notes (used by
  // cup-flavor picks and bundle expansion). Merges into an existing row only if
  // every payload-bearing field matches — keeps cup juice rows (₱80) separate
  // from solo cans (₱195) and from bundle-expanded rows (per-can fractional).
  function addJuiceRow({
    code,
    qty,
    unit_price,
    label,
    emoji,
    notes,
  }: {
    code: Flavor;
    qty: number;
    unit_price: number;
    label: string;
    emoji?: string;
    notes?: string;
  }) {
    const batch_id = batchForSku(code);
    setCart((prev) => {
      const idx = prev.findIndex(
        (it) =>
          it.item_type === "juice" &&
          it.sku_code === code &&
          it.label === label &&
          it.unit_price === unit_price &&
          (it.notes ?? "") === (notes ?? ""),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          id: newCartItemId(),
          item_type: "juice",
          sku_code: code,
          batch_id,
          label,
          emoji,
          qty,
          unit_price,
          notes,
        },
      ];
    });
  }

  function addCupFlavor(cup: PosProductRef, flavor: Flavor) {
    addJuiceRow({
      code: flavor,
      qty: 1,
      unit_price: Number(cup.price ?? 0),
      label: `${cup.name} · ${flavor}`,
      emoji: cup.emoji ?? SKU_EMOJI[flavor],
    });
  }

  function expandBundleFromMix(bundle: PosBundleRef, mix: Record<Flavor, number>) {
    const totalCans = bundle.total_cans || 1;
    // Per-can unit price so the row subtotals sum to the bundle price exactly.
    const unit = Math.round((Number(bundle.price ?? 0) / totalCans) * 100) / 100;
    const note = `From bundle ${bundle.code}`;
    for (const code of ["PCL", "ACG", "WPM"] as const) {
      const qty = mix[code] ?? 0;
      if (qty <= 0) continue;
      addJuiceRow({
        code,
        qty,
        unit_price: unit,
        label: `${bundle.name} · ${code}`,
        emoji: SKU_EMOJI[code],
        notes: note,
      });
    }
  }

  function addPosProduct(p: PosProductRef) {
    // Cups need a flavor picked per cup — open the modal instead of merging.
    if (p.category === "cup") {
      setPickerForCup(p);
      return;
    }
    const itemType = itemTypeForProduct(p.code);
    const unitPrice = Number(p.price ?? 0);
    setCart((prev) => {
      const idx = prev.findIndex(
        (it) =>
          it.item_type === itemType &&
          it.label === p.name &&
          it.unit_price === unitPrice,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          id: newCartItemId(),
          item_type: itemType,
          label: p.name,
          emoji: p.emoji ?? undefined,
          qty: 1,
          unit_price: unitPrice,
        },
      ];
    });
  }

  function handleBundleTap(bundle: PosBundleRef) {
    if (bundle.is_flavor_pickable) {
      setPickerForBundle(bundle);
      return;
    }
    const breakdown = bundle.fixed_breakdown ?? {};
    const sum = (breakdown.PCL ?? 0) + (breakdown.ACG ?? 0) + (breakdown.WPM ?? 0);
    if (sum !== bundle.total_cans) {
      toast.push(`${bundle.code} has an invalid fixed breakdown — edit in Settings.`, "error");
      return;
    }
    expandBundleFromMix(bundle, {
      PCL: breakdown.PCL ?? 0,
      ACG: breakdown.ACG ?? 0,
      WPM: breakdown.WPM ?? 0,
    });
  }

  function addTicket(t: TicketTypeRef) {
    const price = Number(t.price ?? 0);
    setCart((prev) => {
      const idx = prev.findIndex(
        (it) => it.item_type === "ticket" && it.ticket_type_code === t.code,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          id: newCartItemId(),
          item_type: "ticket",
          ticket_type_code: t.code,
          label: `${t.event_category} · ${t.name}`,
          emoji: "🎟️",
          qty: 1,
          unit_price: price,
        },
      ];
    });
  }

  function setItemQty(itemId: string, qty: number) {
    setCart((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, qty: Math.max(1, qty) } : it)),
    );
  }

  function removeItem(itemId: string) {
    setCart((prev) => prev.filter((it) => it.id !== itemId));
  }

  function clearCart() {
    if (cart.length === 0) return;
    if (!window.confirm("Clear all items from the cart?")) return;
    setCart([]);
    setDiscount("0");
    setCashTendered("");
    setPaymentMethod(null);
  }

  const [pickerForBundle, setPickerForBundle] = React.useState<PosBundleRef | null>(null);
  const [pickerForCup, setPickerForCup] = React.useState<PosProductRef | null>(null);

  async function handleCharge() {
    if (!canCharge || !paymentMethod) return;
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_pos_transaction", {
      p_idempotency_key: idempotencyKey,
      p_payment_method: paymentMethod,
      p_shift_id: shift.id,
      p_account_code: null,
      p_event_name: shift.event_name,
      p_discount: discountNum,
      p_staff_name: shift.staff_name,
      p_notes: null,
      p_items: cart.map((it) => ({
        item_type: it.item_type,
        sku_code: it.sku_code ?? null,
        ticket_type_code: it.ticket_type_code ?? null,
        label: it.label,
        qty: it.qty,
        unit_price: it.unit_price,
        batch_id: it.batch_id ?? null,
        notes: it.notes ?? null,
      })),
    });
    setSubmitting(false);

    if (error) {
      toast.push(error.message, "error");
      return;
    }
    if (!data) {
      toast.push("Charge failed: no transaction id", "error");
      return;
    }

    toast.push(`✓ Charged ${formatPHP(total)}`, "success");
    setCart([]);
    setDiscount("0");
    setCashTendered("");
    setPaymentMethod(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  const activeTickets = ticketTypes;

  const productGroups = React.useMemo(() => {
    const m = new Map<string, PosProductRef[]>();
    for (const p of posProducts) {
      const key = p.category || "other";
      const list = m.get(key) ?? [];
      list.push(p);
      m.set(key, list);
    }
    // Stable order: defined categories first, then any unknowns alphabetically.
    const known = CATEGORY_ORDER.filter((c) => m.has(c));
    const extras = Array.from(m.keys())
      .filter((c) => !CATEGORY_ORDER.includes(c))
      .sort();
    return [...known, ...extras].map((c) => ({ category: c, items: m.get(c) ?? [] }));
  }, [posProducts]);
  const openedAt = new Date(shift.opened_at).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });

  const canSeeSessions =
    viewerRole === "owner" || viewerRole === "partner" || viewerRole === "manager";

  // Cart panel body. Rendered twice on small screens (desktop column +
  // mobile slide-up drawer) so we parameterize input IDs to avoid clashes.
  const renderCartBody = ({ idPrefix }: { idPrefix: string }) => (
    <>
      <div className="flex items-baseline justify-between border-b border-border pb-2 mb-2">
        <h2 className="font-serif font-bold text-lg text-ink">Current sale</h2>
        {cart.length > 0 ? (
          <button
            type="button"
            onClick={clearCart}
            className="text-xs text-inkSoft hover:text-coral inline-flex items-center gap-1 min-h-[32px] touch-manipulation"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex-1 min-h-[120px] overflow-y-auto">
        {cart.length === 0 ? (
          <p className="text-sm text-inkSoft text-center py-8">
            Tap a product to add to cart.
          </p>
        ) : (
          <div>
            {cart.map((it) => (
              <CartItemRow
                key={it.id}
                item={it}
                onQtyChange={(q) => setItemQty(it.id, q)}
                onRemove={() => removeItem(it.id)}
                disabled={submitting}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-inkSoft">Subtotal</span>
          <span className="font-mono">{formatPHP(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-discount`} className="text-inkSoft m-0">
            Discount
          </Label>
          <div className="w-28">
            <NumberInput
              id={`${idPrefix}-discount`}
              prefix="₱"
              min="0"
              step="1"
              inputMode="numeric"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={submitting}
              className="h-9 text-right"
            />
          </div>
        </div>
        <div className="flex justify-between border-t border-border pt-2">
          <span className="font-semibold text-ink">Total</span>
          <span className="font-serif font-bold text-xl text-berry">
            {formatPHP(total)}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
          Payment
        </div>
        <PaymentMethodToggle
          value={paymentMethod}
          onChange={setPaymentMethod}
          disabled={submitting}
        />
        {paymentMethod === "Cash" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${idPrefix}-cash_tendered`} className="text-inkSoft m-0">
                Cash tendered
              </Label>
              <div className="w-28">
                <NumberInput
                  id={`${idPrefix}-cash_tendered`}
                  prefix="₱"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  disabled={submitting}
                  className="h-9 text-right"
                />
              </div>
            </div>
            {cashNum !== null && Number.isFinite(cashNum) ? (
              <div className="flex justify-between text-xs">
                <span className="text-inkSoft">Change due</span>
                <span
                  className={`font-mono font-semibold ${
                    change >= 0 ? "text-emerald-700" : "text-coral"
                  }`}
                >
                  {formatPHP(change)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button
        onClick={handleCharge}
        disabled={!canCharge}
        size="lg"
        className="mt-4 w-full min-h-[48px]"
      >
        {submitting ? "Charging…" : `Charge ${formatPHP(total)} →`}
      </Button>
    </>
  );

  return (
    <div className="space-y-5 pb-24 md:pb-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-2xl text-ink flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-berry" />
            Event POS
          </h1>
          <p className="text-sm text-inkSoft mt-0.5">
            {shift.event_name || "Untitled shift"} · since {openedAt}
            {shift.external_id ? (
              <span className="font-mono"> · {shift.external_id}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeSessions ? (
            <Link
              href="/dashboard/pos/sessions"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
            >
              <History className="w-3.5 h-3.5" />
              Past shifts
            </Link>
          ) : null}
          <Button
            variant="berryGhost"
            size="sm"
            onClick={() => setShowCloseDialog(true)}
          >
            Close shift →
          </Button>
        </div>
      </header>

      <div className="space-y-5 md:space-y-0 md:grid md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_360px] md:gap-5">
        {/* Product grid */}
        <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
          <div className="flex gap-1 border-b border-border -mx-4 px-4">
            <TabButton active={tab === "juice"} onClick={() => setTab("juice")}>
              Juice &amp; Cups
            </TabButton>
            <TabButton active={tab === "tickets"} onClick={() => setTab("tickets")}>
              Tickets
            </TabButton>
          </div>

          {tab === "juice" ? (
            <div className="space-y-4 pt-1">
              <div>
                <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
                  Solo cans
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["PCL", "ACG", "WPM"] as const).map((code) => {
                    const sku = skuByCode[code];
                    return (
                      <ProductButton
                        key={code}
                        emoji={SKU_EMOJI[code]}
                        label={code}
                        sublabel={sku?.short_label ?? undefined}
                        price={sku?.retail_price ?? 0}
                        onClick={() => addJuice(code, 1)}
                        disabled={submitting}
                      />
                    );
                  })}
                </div>
              </div>

              {bundles.length > 0 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
                    Bundles
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {bundles.map((b) => (
                      <ProductButton
                        key={b.id}
                        emoji={b.emoji ?? "📦"}
                        label={b.name}
                        sublabel={
                          b.is_flavor_pickable
                            ? `Pick ${b.total_cans}`
                            : `${b.total_cans} cans`
                        }
                        price={b.price}
                        onClick={() => handleBundleTap(b)}
                        disabled={submitting}
                        tone="berry"
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {productGroups.length === 0 ? (
                <p className="text-xs text-inkSoft px-1 py-2">
                  No POS products yet. Add cups, water, or rentals in Settings → Catalog.
                </p>
              ) : (
                productGroups.map((g) => (
                  <div key={g.category}>
                    <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-2">
                      {CATEGORY_LABEL[g.category] ?? g.category}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {g.items.map((p) => (
                        <ProductButton
                          key={p.id}
                          emoji={p.emoji ?? undefined}
                          label={p.name}
                          price={p.price}
                          onClick={() => addPosProduct(p)}
                          disabled={submitting}
                          tone={CATEGORY_TONE[g.category] ?? "default"}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="pt-1">
              {activeTickets.length === 0 ? (
                <p className="text-sm text-inkSoft py-6 text-center">
                  No active ticket types. Add some in Settings.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeTickets.map((t) => (
                    <ProductButton
                      key={t.code}
                      emoji="🎟️"
                      label={t.name}
                      sublabel={t.event_category}
                      price={t.price}
                      onClick={() => addTicket(t)}
                      disabled={submitting}
                      tone="coral"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Current sale — desktop / landscape column (hidden on mobile portrait;
            mobile portrait gets a slide-up drawer instead, see below). */}
        <div className="hidden md:flex md:flex-col bg-white border border-border rounded-lg shadow-card p-4 md:min-h-[480px]">
          {renderCartBody({ idPrefix: "d" })}
        </div>
      </div>

      <SessionSummary
        shiftId={shift.id}
        openingCash={Number(shift.opening_cash ?? 0)}
        onCashOnHandChange={setCashOnHand}
      />

      <BundlePicker
        open={pickerForBundle !== null}
        bundle={pickerForBundle}
        skus={skus}
        onClose={() => setPickerForBundle(null)}
        onConfirm={(mix) => {
          if (pickerForBundle) expandBundleFromMix(pickerForBundle, mix);
        }}
      />

      <CupFlavorPicker
        open={pickerForCup !== null}
        cupName={pickerForCup?.name ?? ""}
        skus={skus}
        onClose={() => setPickerForCup(null)}
        onPick={(flavor) => {
          if (pickerForCup) addCupFlavor(pickerForCup, flavor);
        }}
      />

      <CloseShiftDialog
        open={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        shiftId={shift.id}
        expectedCash={cashOnHand}
      />

      {/* Mobile portrait: sticky cart-summary bar that opens a bottom drawer.
          Hidden from md: up because the cart lives in its own column there. */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={mobileCartOpen}
          aria-label={`Open cart (${cart.length} ${cart.length === 1 ? "item" : "items"}, ${formatPHP(total)})`}
          className="w-full min-h-[56px] px-4 flex items-center justify-between gap-3 touch-manipulation active:bg-cream/60"
        >
          <span className="flex items-center gap-2 text-ink font-semibold">
            <ShoppingCart className="w-4 h-4 text-berry" />
            Cart{cart.length > 0 ? ` (${cart.length})` : ""}
          </span>
          <span className="ml-auto font-serif font-bold text-lg text-berry">
            {formatPHP(total)}
          </span>
          <ChevronUp className="w-4 h-4 text-inkSoft" aria-hidden />
        </button>
      </div>

      {/* Mobile portrait: cart drawer. Backdrop + slide-up sheet. */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-50 flex flex-col transition-opacity",
          mobileCartOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Current sale"
      >
        <button
          type="button"
          onClick={() => setMobileCartOpen(false)}
          aria-label="Close cart"
          className="flex-1 bg-ink/40"
        />
        <div
          className={cn(
            "bg-white border-t border-border rounded-t-xl shadow-card flex flex-col max-h-[88dvh] transition-transform duration-200",
            mobileCartOpen ? "translate-y-0" : "translate-y-full",
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Tap outside or here to close
            </span>
            <button
              type="button"
              onClick={() => setMobileCartOpen(false)}
              aria-label="Close cart"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md text-inkSoft hover:bg-cream touch-manipulation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col flex-1 px-4 pb-4 overflow-hidden">
            {renderCartBody({ idPrefix: "m" })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
        active
          ? "text-berry border-berry"
          : "text-inkSoft border-transparent hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
