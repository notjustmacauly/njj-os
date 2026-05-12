"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPHP } from "@/lib/utils";

type TxnRow = {
  id: string;
  payment_method: "Cash" | "GCash" | "Bank Transfer" | "Xendit" | "Other";
  total: number | string;
  pcl_qty: number;
  acg_qty: number;
  wpm_qty: number;
  cup_sm_qty: number;
  cup_lg_qty: number;
  water_qty: number;
  ticket_qty: number;
};

type Totals = {
  txns: number;
  cans: number;
  cups: number;
  water: number;
  tickets: number;
  revenue: number;
  cash: number;
  gcash: number;
  bank: number;
  xendit: number;
  other: number;
};

const EMPTY: Totals = {
  txns: 0,
  cans: 0,
  cups: 0,
  water: 0,
  tickets: 0,
  revenue: 0,
  cash: 0,
  gcash: 0,
  bank: 0,
  xendit: 0,
  other: 0,
};

function aggregate(rows: TxnRow[]): Totals {
  const t = { ...EMPTY };
  for (const r of rows) {
    const total = Number(r.total ?? 0);
    t.txns += 1;
    t.cans += (r.pcl_qty ?? 0) + (r.acg_qty ?? 0) + (r.wpm_qty ?? 0);
    t.cups += (r.cup_sm_qty ?? 0) + (r.cup_lg_qty ?? 0);
    t.water += r.water_qty ?? 0;
    t.tickets += r.ticket_qty ?? 0;
    t.revenue += total;
    switch (r.payment_method) {
      case "Cash":
        t.cash += total;
        break;
      case "GCash":
        t.gcash += total;
        break;
      case "Bank Transfer":
        t.bank += total;
        break;
      case "Xendit":
        t.xendit += total;
        break;
      default:
        t.other += total;
    }
  }
  return t;
}

export function SessionSummary({
  shiftId,
  openingCash,
  onCashOnHandChange,
}: {
  shiftId: string;
  openingCash: number;
  /** Reports expected-cash (opening + cash sales) up to parent for use in close dialog. */
  onCashOnHandChange?: (cashOnHand: number) => void;
}) {
  const [totals, setTotals] = React.useState<Totals>(EMPTY);

  const fetchTotals = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("pos_transactions")
      .select(
        "id, payment_method, total, pcl_qty, acg_qty, wpm_qty, cup_sm_qty, cup_lg_qty, water_qty, ticket_qty",
      )
      .eq("shift_id", shiftId)
      .is("deleted_at", null);
    setTotals(aggregate((data ?? []) as TxnRow[]));
  }, [shiftId]);

  React.useEffect(() => {
    fetchTotals();
    const supabase = createClient();
    const channel = supabase
      .channel(`pos-shift-${shiftId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pos_transactions",
          filter: `shift_id=eq.${shiftId}`,
        },
        () => {
          fetchTotals();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [shiftId, fetchTotals]);

  const cashOnHand = openingCash + totals.cash;

  React.useEffect(() => {
    onCashOnHandChange?.(cashOnHand);
  }, [cashOnHand, onCashOnHandChange]);

  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Tile label="Transactions" value={String(totals.txns)} />
        <Tile label="Cans sold" value={String(totals.cans)} />
        <Tile label="Cups sold" value={String(totals.cups)} />
        <Tile label="Tickets" value={String(totals.tickets)} />
        <Tile label="Revenue" value={formatPHP(totals.revenue)} accent />
      </div>

      <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
            Cash on hand
          </div>
          <div className="font-mono font-semibold text-ink">
            {formatPHP(cashOnHand)}
          </div>
          <div className="text-xs text-inkSoft">
            {formatPHP(openingCash)} float + {formatPHP(totals.cash)} sales
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
            GCash received
          </div>
          <div className="font-mono font-semibold text-ink">
            {formatPHP(totals.gcash)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
            Bank / Xendit / Other
          </div>
          <div className="font-mono font-semibold text-ink">
            {formatPHP(totals.bank + totals.xendit + totals.other)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-cream/40 border border-border rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
        {label}
      </div>
      <div
        className={`font-mono font-bold ${accent ? "text-berry text-lg" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}
