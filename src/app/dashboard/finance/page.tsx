import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/ui/kpi-card";
import { formatPHP } from "@/lib/utils";
import { ActivityFeed, type ActivityRow } from "./activity-feed";
import { OWNER_PARTNER, type Role } from "@/lib/roles";

const FINANCE_ROLES = OWNER_PARTNER;

function mtdStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function lastMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // End at "same-day previous month" so the comparison is apples-to-apples
  // (e.g. on the 11th, compare May 1–11 to Apr 1–11).
  const end = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return { start, end };
}

function trendString(current: number, prev: number): string {
  if (prev === 0 && current === 0) return "vs last month";
  if (prev === 0) return "▲ vs last month";
  const pct = Math.round(((current - prev) / prev) * 100);
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "—";
  return `${arrow} ${Math.abs(pct)}% vs last month`;
}

export default async function FinanceOverviewPage() {
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
  const role = roleRow?.role as Role | null;
  if (!role || !FINANCE_ROLES.includes(role)) redirect("/dashboard");

  const mtd = mtdStart();
  const { start: lmStart, end: lmEnd } = lastMonthRange();

  const [
    { data: balances },
    { data: receivables },
    { data: bills },
    { data: mtdInRows },
    { data: lmInRows },
    { data: mtdExpRows },
    { data: lmExpRows },
    { data: feedRows },
  ] = await Promise.all([
    supabase
      .from("account_balances")
      .select("code, name, current_balance, is_active")
      .eq("is_active", true),
    supabase
      .from("receivables")
      .select("amount, partner_id, status")
      .in("status", ["pending", "billed"])
      .is("deleted_at", null),
    supabase
      .from("bills")
      .select("total, paid_amount, status")
      .eq("status", "issued")
      .is("deleted_at", null),
    supabase
      .from("ledger_entries")
      .select("amount, ref_type")
      .eq("direction", "in")
      .gte("occurred_at", mtd.toISOString()),
    supabase
      .from("ledger_entries")
      .select("amount")
      .eq("direction", "in")
      .gte("occurred_at", lmStart.toISOString())
      .lt("occurred_at", lmEnd.toISOString()),
    supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", mtd.toISOString().slice(0, 10))
      .is("voided_at", null)
      .is("deleted_at", null),
    supabase
      .from("expenses")
      .select("amount")
      .gte("expense_date", lmStart.toISOString().slice(0, 10))
      .lt("expense_date", lmEnd.toISOString().slice(0, 10))
      .is("voided_at", null)
      .is("deleted_at", null),
    supabase
      .from("ledger_entries")
      .select(
        "id, occurred_at, account_code, direction, amount, ref_type, ref_id, ref_external_id, description",
      )
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const cashOnHand = (balances ?? []).reduce(
    (s, b) => s + Number((b as { current_balance: number | string }).current_balance ?? 0),
    0,
  );
  const accountCount = balances?.length ?? 0;

  const totalReceivable = (receivables ?? []).reduce(
    (s, r) => s + Number((r as { amount: number | string }).amount ?? 0),
    0,
  );
  const recvPartners = new Set(
    (receivables ?? []).map((r) => (r as { partner_id: string }).partner_id),
  ).size;

  const billRows = (bills ?? []) as Array<{ total: number | string; paid_amount: number | string }>;
  const outstandingBills = billRows.filter(
    (b) => Number(b.total ?? 0) - Number(b.paid_amount ?? 0) > 0,
  );
  const totalPayable = outstandingBills.reduce(
    (s, b) => s + (Number(b.total ?? 0) - Number(b.paid_amount ?? 0)),
    0,
  );

  const mtdInRowsTyped = (mtdInRows ?? []) as Array<{
    amount: number | string;
    ref_type: string | null;
  }>;
  const mtdRevenue = mtdInRowsTyped.reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );

  // Breakdown by source. Keep buckets aligned with sourceLabelFor():
  //   B2B orders = order + bill + receivable inflows
  //   POS sales  = pos_shift
  //   Standalone = revenue (logged via log_revenue)
  //   Other      = everything else still posting 'in' (tickets, manual)
  const mtdRevenueBreakdown = mtdInRowsTyped.reduce(
    (acc, r) => {
      const amt = Number(r.amount ?? 0);
      const t = r.ref_type ?? "";
      if (t === "order" || t === "bill" || t === "receivable") {
        acc.b2b += amt;
      } else if (t === "pos_shift") {
        acc.pos += amt;
      } else if (t === "revenue") {
        acc.standalone += amt;
      } else {
        acc.other += amt;
      }
      return acc;
    },
    { b2b: 0, pos: 0, standalone: 0, other: 0 },
  );
  const lmRevenue = (lmInRows ?? []).reduce(
    (s, r) => s + Number((r as { amount: number | string }).amount ?? 0),
    0,
  );
  const mtdExpenses = (mtdExpRows ?? []).reduce(
    (s, r) => s + Number((r as { amount: number | string }).amount ?? 0),
    0,
  );
  const lmExpenses = (lmExpRows ?? []).reduce(
    (s, r) => s + Number((r as { amount: number | string }).amount ?? 0),
    0,
  );
  const mtdNet = mtdRevenue - mtdExpenses;

  // Build a code → name map so the activity feed can show readable names.
  const accountNameByCode: Record<string, string> = {};
  for (const b of balances ?? []) {
    const row = b as { code: string; name: string };
    accountNameByCode[row.code] = row.name;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">💼</span>
          Finance
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Cash, revenue, receivables and payables at a glance.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Cash on hand"
          value={formatPHP(cashOnHand)}
          sub={`across ${accountCount} account${accountCount === 1 ? "" : "s"}`}
          accent="berry"
        />
        <KpiCard
          label="Total receivable"
          value={formatPHP(totalReceivable)}
          sub={`from ${recvPartners} customer${recvPartners === 1 ? "" : "s"}`}
          accent="peri"
        />
        <KpiCard
          label="Total payable"
          value={formatPHP(totalPayable)}
          sub={`across ${outstandingBills.length} bill${outstandingBills.length === 1 ? "" : "s"}`}
          accent="coral"
        />
        <KpiCard
          label="MTD revenue"
          value={formatPHP(mtdRevenue)}
          sub={trendString(mtdRevenue, lmRevenue)}
          accent="berry"
        />
        <KpiCard
          label="MTD expenses"
          value={formatPHP(mtdExpenses)}
          sub={trendString(mtdExpenses, lmExpenses)}
          accent="coral"
        />
        <KpiCard
          label="MTD net"
          value={formatPHP(mtdNet)}
          sub={mtdNet >= 0 ? "profit so far" : "loss so far"}
          accent="peri"
        />
      </div>

      <section className="bg-white border border-border rounded-lg shadow-card p-5">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="font-serif font-bold text-lg text-ink">
            MTD revenue breakdown
          </h2>
          <span className="text-xs text-inkSoft">
            sum of {formatPHP(mtdRevenue)} across sources
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <BreakdownLine label="B2B orders" value={mtdRevenueBreakdown.b2b} />
          <BreakdownLine label="POS sales" value={mtdRevenueBreakdown.pos} />
          <BreakdownLine
            label="Standalone"
            value={mtdRevenueBreakdown.standalone}
          />
          <BreakdownLine label="Other" value={mtdRevenueBreakdown.other} />
        </dl>
      </section>

      <section>
        <h2 className="font-serif font-bold text-xl text-ink mb-3">Recent activity</h2>
        <ActivityFeed
          initial={(feedRows ?? []) as ActivityRow[]}
          accountNameByCode={accountNameByCode}
        />
      </section>
    </div>
  );
}

function BreakdownLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
        {label}
      </dt>
      <dd className="font-serif font-bold text-lg text-ink tabular-nums">
        {formatPHP(value)}
      </dd>
    </div>
  );
}
