import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatPHP } from "@/lib/utils";

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
};

type TxnAgg = { shift_id: string; total: number; cash: number; count: number };

function timeOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PosSessionsPage() {
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
  // Per matrix: owner/partner/manager can view all past shifts; staff only own.
  if (role !== "owner" && role !== "partner" && role !== "manager") {
    redirect("/dashboard/pos");
  }

  const { data: shiftsData } = await supabase
    .from("pos_shifts")
    .select(
      "id, external_id, shift_date, event_name, staff_name, opened_at, closed_at, opening_cash, closing_cash",
    )
    .is("deleted_at", null)
    .order("opened_at", { ascending: false })
    .limit(100);

  const shifts = (shiftsData ?? []) as ShiftRow[];

  // Aggregate per-shift txn totals in one query
  const txnAggByShift: Record<string, TxnAgg> = {};
  const shiftIds = shifts.map((s) => s.id);
  if (shiftIds.length > 0) {
    const { data: txns } = await supabase
      .from("pos_transactions")
      .select("shift_id, payment_method, total")
      .in("shift_id", shiftIds)
      .is("deleted_at", null);
    for (const r of (txns ?? []) as Array<{
      shift_id: string;
      payment_method: string;
      total: number | string;
    }>) {
      if (!r.shift_id) continue;
      const agg = txnAggByShift[r.shift_id] ?? {
        shift_id: r.shift_id,
        total: 0,
        cash: 0,
        count: 0,
      };
      const t = Number(r.total ?? 0);
      agg.total += t;
      if (r.payment_method === "Cash") agg.cash += t;
      agg.count += 1;
      txnAggByShift[r.shift_id] = agg;
    }
  }

  function variance(s: ShiftRow): number | null {
    if (s.closed_at === null) return null;
    const agg = txnAggByShift[s.id] ?? { total: 0, cash: 0, count: 0 };
    const expected = Number(s.opening_cash ?? 0) + agg.cash;
    return Number(s.closing_cash ?? 0) - expected;
  }

  const columns: Column<ShiftRow>[] = [
    {
      key: "external_id",
      header: "Shift",
      className: "w-36",
      render: (r) => (
        <Link
          href={`/dashboard/pos/sessions/${r.id}`}
          className="font-mono text-xs text-ink hover:text-berry"
        >
          {r.external_id ?? r.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      key: "shift_date",
      header: "Date",
      className: "w-24",
      render: (r) => (
        <span className="text-xs text-inkSoft">{formatDate(r.shift_date)}</span>
      ),
    },
    {
      key: "event_name",
      header: "Event",
      render: (r) => (
        <span className="text-sm text-ink">{r.event_name || "—"}</span>
      ),
    },
    {
      key: "staff_name",
      header: "Staff",
      className: "w-32",
      render: (r) => (
        <span className="text-sm text-inkSoft">{r.staff_name || "—"}</span>
      ),
    },
    {
      key: "opened",
      header: "Opened",
      className: "w-20",
      render: (r) => (
        <span className="text-xs text-inkSoft font-mono">
          {timeOnly(r.opened_at)}
        </span>
      ),
    },
    {
      key: "closed",
      header: "Closed",
      className: "w-20",
      render: (r) =>
        r.closed_at ? (
          <span className="text-xs text-inkSoft font-mono">
            {timeOnly(r.closed_at)}
          </span>
        ) : (
          <Badge tone="yellow">Open</Badge>
        ),
    },
    {
      key: "txns",
      header: "Txns",
      className: "w-12 text-right font-mono text-xs",
      render: (r) => txnAggByShift[r.id]?.count ?? 0,
    },
    {
      key: "revenue",
      header: "Revenue",
      className: "w-24 text-right",
      render: (r) => (
        <span className="font-mono text-sm text-berry font-semibold">
          {formatPHP(txnAggByShift[r.id]?.total ?? 0)}
        </span>
      ),
    },
    {
      key: "variance",
      header: "Variance",
      className: "w-24 text-right",
      render: (r) => {
        const v = variance(r);
        if (v === null) return <span className="text-inkSoft text-xs">—</span>;
        if (v === 0) return <span className="text-inkSoft font-mono text-xs">₱0</span>;
        const tone = v > 0 ? "text-emerald-700" : "text-coral";
        return (
          <span className={`font-mono text-xs font-semibold ${tone}`}>
            {v > 0 ? "+" : "−"}
            {formatPHP(Math.abs(v))}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/pos"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to POS
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">🛒</span>
          POS shifts
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Past and currently-open shifts across all staff.
        </p>
      </header>

      {shifts.length === 0 ? (
        <EmptyState
          emoji="🛒"
          title="No shifts yet"
          description="Open the first POS shift from the dashboard."
        />
      ) : (
        <DataTable columns={columns} rows={shifts} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
