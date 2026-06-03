import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatPHP } from "@/lib/utils";
import { RecordPager } from "@/components/record-pager";

function timeOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ShiftRow = {
  id: string;
  external_id: string | null;
  shift_date: string;
  event_name: string | null;
  staff_name: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number | string;
  closing_cash: number | string | null;
  notes: string | null;
  default_batch_pcl: string | null;
  default_batch_acg: string | null;
  default_batch_wpm: string | null;
};

type TxnRow = {
  id: string;
  external_id: string | null;
  transaction_at: string;
  payment_method: string;
  total: number | string;
  subtotal: number | string;
  discount: number | string;
  pcl_qty: number;
  acg_qty: number;
  wpm_qty: number;
  cup_sm_qty: number;
  cup_lg_qty: number;
  water_qty: number;
  ticket_qty: number;
};

export default async function PosSessionDetailPage({
  params,
}: {
  params: { shiftId: string };
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
  if (role !== "owner" && role !== "partner" && role !== "manager") {
    redirect("/dashboard/pos");
  }

  const { data: shiftData } = await supabase
    .from("pos_shifts")
    .select(
      "id, external_id, shift_date, event_name, staff_name, opened_at, closed_at, opening_cash, closing_cash, notes, default_batch_pcl, default_batch_acg, default_batch_wpm",
    )
    .eq("id", params.shiftId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!shiftData) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/pos/sessions"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to shifts
        </Link>
        <p className="text-sm text-inkSoft">Shift not found.</p>
      </div>
    );
  }

  const shift = shiftData as ShiftRow;

  const { data: txnsData } = await supabase
    .from("pos_transactions")
    .select(
      "id, external_id, transaction_at, payment_method, total, subtotal, discount, pcl_qty, acg_qty, wpm_qty, cup_sm_qty, cup_lg_qty, water_qty, ticket_qty",
    )
    .eq("shift_id", shift.id)
    .is("deleted_at", null)
    .order("transaction_at", { ascending: true });

  const txns = (txnsData ?? []) as TxnRow[];

  const totals = txns.reduce(
    (acc, t) => {
      const total = Number(t.total ?? 0);
      acc.revenue += total;
      acc.txns += 1;
      if (t.payment_method === "Cash") acc.cash += total;
      else if (t.payment_method === "GCash") acc.gcash += total;
      else if (t.payment_method === "Bank Transfer") acc.bank += total;
      else acc.other += total;
      acc.cans += (t.pcl_qty ?? 0) + (t.acg_qty ?? 0) + (t.wpm_qty ?? 0);
      acc.cups += (t.cup_sm_qty ?? 0) + (t.cup_lg_qty ?? 0);
      acc.water += t.water_qty ?? 0;
      acc.tickets += t.ticket_qty ?? 0;
      return acc;
    },
    {
      revenue: 0,
      txns: 0,
      cash: 0,
      gcash: 0,
      bank: 0,
      other: 0,
      cans: 0,
      cups: 0,
      water: 0,
      tickets: 0,
    },
  );

  const opening = Number(shift.opening_cash ?? 0);
  const closing = shift.closed_at ? Number(shift.closing_cash ?? 0) : null;
  const expected = opening + totals.cash;
  const variance = closing !== null ? closing - expected : null;

  const columns: Column<TxnRow>[] = [
    {
      key: "external_id",
      header: "Txn",
      className: "w-36",
      render: (r) => (
        <span className="font-mono text-xs text-ink">
          {r.external_id ?? r.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "time",
      header: "Time",
      className: "w-20",
      render: (r) => (
        <span className="text-xs text-inkSoft font-mono">
          {timeOnly(r.transaction_at)}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      render: (r) => {
        const parts: string[] = [];
        if (r.pcl_qty) parts.push(`${r.pcl_qty}×PCL`);
        if (r.acg_qty) parts.push(`${r.acg_qty}×ACG`);
        if (r.wpm_qty) parts.push(`${r.wpm_qty}×WPM`);
        if (r.cup_sm_qty) parts.push(`${r.cup_sm_qty}×Cup S`);
        if (r.cup_lg_qty) parts.push(`${r.cup_lg_qty}×Cup L`);
        if (r.water_qty) parts.push(`${r.water_qty}×Water`);
        if (r.ticket_qty) parts.push(`${r.ticket_qty}×🎟`);
        return (
          <span className="text-xs text-inkSoft">
            {parts.length > 0 ? parts.join(" · ") : "—"}
          </span>
        );
      },
    },
    {
      key: "payment",
      header: "Payment",
      className: "w-28",
      render: (r) => <Badge tone="muted">{r.payment_method}</Badge>,
    },
    {
      key: "discount",
      header: "Disc.",
      className: "w-16 text-right font-mono text-xs",
      render: (r) =>
        Number(r.discount ?? 0) > 0 ? (
          <span className="text-coral">−{formatPHP(r.discount)}</span>
        ) : (
          <span className="text-inkSoft">—</span>
        ),
    },
    {
      key: "total",
      header: "Total",
      className: "w-24 text-right",
      render: (r) => (
        <span className="font-mono text-sm font-semibold text-berry">
          {formatPHP(r.total)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center justify-between gap-2 mb-2">
          <Link
            href="/dashboard/pos/sessions"
            className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to shifts
          </Link>
          <RecordPager
            entity="pos-sessions"
            current={params.shiftId}
            basePath="/dashboard/pos/sessions"
          />
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif font-bold text-2xl text-ink">
            {shift.event_name || "Untitled shift"}
          </h1>
          <span className="font-mono text-xs text-inkSoft">
            {shift.external_id ?? shift.id.slice(0, 8)}
          </span>
          {!shift.closed_at ? <Badge tone="yellow">Open</Badge> : null}
        </div>
        <p className="text-sm text-inkSoft mt-1">
          {formatDate(shift.shift_date)} · {shift.staff_name || "—"} ·
          opened {timeOnly(shift.opened_at)}
          {shift.closed_at ? ` · closed ${timeOnly(shift.closed_at)}` : null}
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Transactions" value={String(totals.txns)} />
        <Tile label="Cans sold" value={String(totals.cans)} />
        <Tile label="Cups + water" value={String(totals.cups + totals.water)} />
        <Tile label="Tickets" value={String(totals.tickets)} />
      </section>

      <section className="bg-white border border-border rounded-lg shadow-card p-5">
        <h2 className="font-serif font-bold text-lg text-ink mb-3">
          Cash reconciliation
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row dt="Opening float" dd={formatPHP(opening)} />
          <Row dt="Cash sales" dd={formatPHP(totals.cash)} />
          <Row dt="GCash" dd={formatPHP(totals.gcash)} />
          <Row dt="Bank transfer" dd={formatPHP(totals.bank)} />
          <Row dt="Other payment" dd={formatPHP(totals.other)} />
          <Row dt="Total revenue" dd={formatPHP(totals.revenue)} accent />
        </dl>
        <div className="border-t border-border mt-4 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Expected cash
            </div>
            <div className="font-mono font-semibold">{formatPHP(expected)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Counted closing cash
            </div>
            <div className="font-mono font-semibold">
              {closing !== null ? formatPHP(closing) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Variance
            </div>
            {variance === null ? (
              <div className="text-inkSoft">—</div>
            ) : variance === 0 ? (
              <div className="font-mono font-semibold text-inkSoft">₱0</div>
            ) : (
              <div
                className={`font-mono font-semibold ${
                  variance > 0 ? "text-emerald-700" : "text-coral"
                }`}
              >
                {variance > 0 ? "+" : "−"}
                {formatPHP(Math.abs(variance))}
              </div>
            )}
          </div>
        </div>
      </section>

      {shift.notes ? (
        <section className="bg-cream/40 border border-border rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
            Notes
          </div>
          <p className="text-sm text-ink whitespace-pre-wrap">{shift.notes}</p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-serif font-bold text-lg text-ink">
          Transactions ({txns.length})
        </h2>
        {txns.length === 0 ? (
          <p className="text-sm text-inkSoft">No transactions in this shift.</p>
        ) : (
          <DataTable columns={columns} rows={txns} rowKey={(r) => r.id} />
        )}
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
        {label}
      </div>
      <div className="font-mono font-bold text-lg text-ink">{value}</div>
    </div>
  );
}

function Row({
  dt,
  dd,
  accent,
}: {
  dt: string;
  dd: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between border-b border-border/60 pb-1.5 last:border-b-0">
      <dt className="text-inkSoft">{dt}</dt>
      <dd
        className={`font-mono ${accent ? "text-berry font-semibold" : "text-ink"}`}
      >
        {dd}
      </dd>
    </div>
  );
}
