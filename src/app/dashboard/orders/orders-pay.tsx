"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatPHP } from "@/lib/utils";

export type Account = { code: string; name: string };

export type PayableOrder = {
  id: string;
  external_id: string | null;
  channel: "B2B" | "Retail" | "Online" | "Event";
  total: number | string;
  payment_status: string;
  fulfillment_status: string;
  partner: { name: string; pays_on_delivery: boolean | null } | null;
  customer_name: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Can this order be settled directly (no bill), and by which RPC? */
export function payableInline(o: PayableOrder): boolean {
  if (o.payment_status === "Paid" || o.payment_status === "Cancelled") return false;
  if (o.channel !== "B2B") return true;
  // B2B only when the partner pays on delivery AND it's delivered (receivable exists).
  return !!o.partner?.pays_on_delivery && o.fulfillment_status === "Delivered";
}

/** Bulk is limited to non-B2B (event/retail day cleanup) for safety. */
export function payableBulk(o: PayableOrder): boolean {
  return (
    o.channel !== "B2B" &&
    o.payment_status !== "Paid" &&
    o.payment_status !== "Cancelled"
  );
}

// Remember the last-used account across the session so repeat collection is
// basically one tap + confirm.
let lastAccount = "";

// ── Inline per-row "Mark paid" ──────────────────────────────────
export function OrderPayCell({
  order,
  accounts,
}: {
  order: PayableOrder;
  accounts: Account[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [account, setAccount] = React.useState(lastAccount || accounts[0]?.code || "");
  const [amount, setAmount] = React.useState(String(Number(order.total)));
  const [date, setDate] = React.useState(todayIso());

  if (!payableInline(order)) {
    return <span className="text-inkSoft">—</span>;
  }

  function openModal() {
    setAccount(lastAccount || accounts[0]?.code || "");
    setAmount(String(Number(order.total)));
    setDate(todayIso());
    setOpen(true);
  }

  async function save() {
    if (!account) return toast.push("Pick an account", "error");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.push("Amount must be > 0", "error");
    setBusy(true);
    const supabase = createClient();
    const rpc = order.channel === "B2B" ? "mark_order_paid_cod" : "mark_order_paid";
    const { error } = await supabase.rpc(rpc, {
      p_order_id: order.id,
      p_account_code: account,
      p_amount: amt,
      p_paid_date: date,
    });
    setBusy(false);
    if (error) return toast.push(error.message || "Couldn't mark paid", "error");
    lastAccount = account;
    toast.push(`Order ${order.external_id ?? ""} marked paid`, "success");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-cream"
      >
        Mark paid
      </button>
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Mark order paid"
        description={`Order ${order.external_id ?? ""}${
          order.channel === "B2B" ? " · settles the receivable (pays on delivery)" : ""
        }`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
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
            <Label htmlFor="op-acct" required>
              Receiving account
            </Label>
            <Select id="op-acct" value={account} onChange={(e) => setAccount(e.target.value)} disabled={busy}>
              {accounts.length === 0 ? <option value="">No accessible accounts</option> : null}
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="op-amt" required>
                Amount
              </Label>
              <NumberInput
                id="op-amt"
                prefix="₱"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-date">Date</Label>
              <DateInput id="op-date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Bulk "quick collect" panel ──────────────────────────────────
export function OrdersBulkPay({
  orders,
  accounts,
}: {
  orders: PayableOrder[];
  accounts: Account[];
}) {
  const router = useRouter();
  const toast = useToast();
  const eligible = React.useMemo(() => orders.filter(payableBulk), [orders]);
  const [openPanel, setOpenPanel] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [account, setAccount] = React.useState(lastAccount || accounts[0]?.code || "");
  const [date, setDate] = React.useState(todayIso());
  const [busy, setBusy] = React.useState(false);

  if (eligible.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === eligible.length ? new Set() : new Set(eligible.map((o) => o.id)),
    );
  }

  const selectedTotal = eligible
    .filter((o) => selected.has(o.id))
    .reduce((s, o) => s + Number(o.total), 0);

  async function markPaid() {
    if (selected.size === 0) return;
    if (!account) return toast.push("Pick an account", "error");
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("mark_orders_paid_bulk", {
      p_order_ids: Array.from(selected),
      p_account_code: account,
      p_paid_date: date,
    });
    setBusy(false);
    if (error) return toast.push(error.message || "Couldn't mark paid", "error");
    lastAccount = account;
    const paid = (data as { paid?: number; skipped?: number } | null)?.paid ?? 0;
    const skipped = (data as { skipped?: number } | null)?.skipped ?? 0;
    toast.push(
      `Marked ${paid} paid${skipped ? ` · ${skipped} skipped` : ""}`,
      skipped && !paid ? "error" : "success",
    );
    setSelected(new Set());
    setOpenPanel(false);
    router.refresh();
  }

  return (
    <div className="bg-white border border-border rounded-lg shadow-card">
      <button
        type="button"
        onClick={() => setOpenPanel((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm"
      >
        <span className="font-semibold text-ink">
          ⚡ Quick-collect payments
          <span className="ml-2 font-normal text-inkSoft">
            {eligible.length} unpaid retail/online/event order{eligible.length === 1 ? "" : "s"} in view
          </span>
        </span>
        <span className="text-berry text-xs">{openPanel ? "Hide" : "Show"}</span>
      </button>

      {openPanel ? (
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button type="button" onClick={toggleAll} className="text-xs text-berry hover:underline">
              {selected.size === eligible.length ? "Clear all" : "Select all"}
            </button>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="bulk-acct" required>
                  Paid to account
                </Label>
                <Select
                  id="bulk-acct"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  disabled={busy}
                  className="h-9 text-sm"
                >
                  {accounts.length === 0 ? <option value="">No accessible accounts</option> : null}
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-date">Date</Label>
                <DateInput
                  id="bulk-date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={busy}
                  className="h-9"
                />
              </div>
              <Button size="sm" onClick={markPaid} disabled={busy || selected.size === 0}>
                {busy ? "Saving…" : `Mark ${selected.size || ""} paid`}
              </Button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border border border-border rounded-md">
            {eligible.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-cream/60 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  disabled={busy}
                />
                <span className="font-mono text-xs text-inkSoft w-28 shrink-0">
                  {o.external_id ?? o.id.slice(0, 8)}
                </span>
                <span className="flex-1 truncate">{o.customer_name || "Walk-in"}</span>
                <span className="text-xs text-inkSoft">{o.channel}</span>
                <span className="font-semibold text-berry w-24 text-right">{formatPHP(o.total)}</span>
              </label>
            ))}
          </div>

          {selected.size > 0 ? (
            <p className="text-xs text-inkSoft text-right">
              {selected.size} selected · {formatPHP(selectedTotal)} to{" "}
              <span className="font-semibold">
                {accounts.find((a) => a.code === account)?.name ?? "—"}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
