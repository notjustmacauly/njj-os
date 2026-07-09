import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn, formatPHP } from "@/lib/utils";
import { hasRole, OWNER_PARTNER, type Role } from "@/lib/roles";
import { KpiCard } from "@/components/ui/kpi-card";
import { UrlSelect } from "@/components/ui/url-filters";
import { EmptyState } from "@/components/ui/empty-state";

// Reports: monthly finance analysis. Two views —
//   cashflow: money in vs out (report_monthly_cashflow)
//   profit:   juice revenue − COGS − expenses (report_monthly_profit)
// Both bucket by the date each entry occurred. Owner/partner only.

type CashRow = {
  month: string;
  cash_in: number | string; cash_out: number | string; net: number | string;
  sales: number | string; refunds: number | string; other_income: number | string;
  opex: number | string; inventory: number | string; other_out: number | string;
};
type ProfitRow = {
  month: string;
  revenue: number | string; cogs: number | string; gross_profit: number | string;
  opex: number | string; operating_profit: number | string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (v: number | string | null | undefined) => Number(v ?? 0);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { year?: string; view?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  const role = (roleRow?.role as Role | null) ?? null;
  if (!hasRole(role, OWNER_PARTNER)) redirect("/dashboard/finance");

  const view = searchParams?.view === "profit" ? "profit" : "cashflow";

  const { data: cashData } = await supabase.rpc("report_monthly_cashflow");
  const cashRows = (cashData ?? []) as CashRow[];
  const years = Array.from(new Set(cashRows.map((r) => r.month.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
  const selectedYear = searchParams?.year && years.includes(searchParams.year)
    ? searchParams.year
    : years[0] ?? String(new Date().getFullYear());
  const hasData = cashRows.length > 0;

  const yearQS = (v: string) => `?view=${v}${selectedYear ? `&year=${selectedYear}` : ""}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-berry" />
            Reports
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Monthly performance, bucketed by the date each entry actually occurred.
          </p>
        </div>
        <div className="w-36">
          <UrlSelect paramKey="year" options={(years.length ? years : [selectedYear]).map((y) => ({ value: y, label: y }))} ariaLabel="Year" />
        </div>
      </header>

      <nav className="flex gap-1 border-b border-border">
        {([["cashflow", "Cash flow"], ["profit", "Profit"]] as const).map(([v, label]) => (
          <Link
            key={v}
            href={yearQS(v)}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition",
              view === v ? "text-berry border-berry" : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {!hasData ? (
        <EmptyState emoji="📊" title="No financial activity yet" description="Once money moves through the ledger, monthly figures appear here." />
      ) : view === "cashflow" ? (
        <CashflowView rows={cashRows} year={selectedYear} />
      ) : (
        <ProfitView supabase={supabase} year={selectedYear} />
      )}
    </div>
  );
}

// ── Cash-flow view ──────────────────────────────────────────────
function CashflowView({ rows, year }: { rows: CashRow[]; year: string }) {
  const byKey = new Map(rows.map((r) => [r.month.slice(0, 7), r]));
  const months = MONTHS.map((label, i) => {
    const row = byKey.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? null;
    return { label, in: row ? n(row.cash_in) : 0, out: row ? n(row.cash_out) : 0, net: row ? n(row.net) : 0, row };
  });
  const totalIn = months.reduce((s, m) => s + m.in, 0);
  const totalOut = months.reduce((s, m) => s + m.out, 0);
  const totalNet = totalIn - totalOut;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={`Money in · ${year}`} value={formatPHP(totalIn)} accent="green" sub="sales, refunds, other income" />
        <KpiCard label={`Money out · ${year}`} value={formatPHP(totalOut)} accent="coral" sub="expenses + inventory buys" />
        <KpiCard label={`Net · ${year}`} value={formatPHP(totalNet)} accent={totalNet >= 0 ? "berry" : "coral"} sub={totalNet >= 0 ? "cash surplus" : "cash deficit"} />
      </div>
      <ChartCard aLabel="Money in" bLabel="Money out" months={months.map((m) => ({ label: m.label, a: m.in, b: m.out }))} />
      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold">Month</th>
              <th className="px-4 py-2 font-semibold text-right">Sales</th>
              <th className="px-4 py-2 font-semibold text-right">Refunds</th>
              <th className="px-4 py-2 font-semibold text-right">Expenses</th>
              <th className="px-4 py-2 font-semibold text-right">Inventory buys</th>
              <th className="px-4 py-2 font-semibold text-right">In</th>
              <th className="px-4 py-2 font-semibold text-right">Out</th>
              <th className="px-4 py-2 font-semibold text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{m.label}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{m.row ? formatPHP(n(m.row.sales)) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{m.row ? formatPHP(n(m.row.refunds)) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{m.row ? formatPHP(n(m.row.opex)) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{m.row ? formatPHP(n(m.row.inventory)) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-leaf">{m.row ? formatPHP(m.in) : "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-coral">{m.row ? formatPHP(m.out) : "—"}</td>
                <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums font-semibold", m.net >= 0 ? "text-ink" : "text-coral")}>{m.row ? formatPHP(m.net) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-inkSoft px-1">Cash-flow view. Internal transfers between your own accounts are excluded.</p>
    </>
  );
}

// ── Profit view ─────────────────────────────────────────────────
async function ProfitView({
  supabase,
  year,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  year: string;
}) {
  const { data } = await supabase.rpc("report_monthly_profit");
  const rows = (data ?? []) as ProfitRow[];
  const byKey = new Map(rows.map((r: ProfitRow) => [r.month.slice(0, 7), r]));
  const months = MONTHS.map((label, i) => {
    const row = (byKey.get(`${year}-${String(i + 1).padStart(2, "0")}`) ?? null) as ProfitRow | null;
    return {
      label,
      revenue: row ? n(row.revenue) : 0,
      cogs: row ? n(row.cogs) : 0,
      gross: row ? n(row.gross_profit) : 0,
      opex: row ? n(row.opex) : 0,
      op: row ? n(row.operating_profit) : 0,
      row,
    };
  });
  const tRev = months.reduce((s, m) => s + m.revenue, 0);
  const tCogs = months.reduce((s, m) => s + m.cogs, 0);
  const tGross = tRev - tCogs;
  const tOpex = months.reduce((s, m) => s + m.opex, 0);
  const tOp = tGross - tOpex;
  const margin = tRev > 0 ? Math.round((tGross / tRev) * 1000) / 10 : 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KpiCard label={`Juice revenue · ${year}`} value={formatPHP(tRev)} accent="green" sub="cans sold (delivered + POS)" />
        <KpiCard label="Gross profit" value={formatPHP(tGross)} accent="berry" sub={`${margin}% margin`} />
        <KpiCard label="Operating expenses" value={formatPHP(tOpex)} accent="coral" sub="expenses net of refunds" />
        <KpiCard label="Operating profit" value={formatPHP(tOp)} accent={tOp >= 0 ? "berry" : "coral"} sub={tOp >= 0 ? "juice ops surplus" : "juice ops deficit"} />
      </div>
      <ChartCard aLabel="Revenue" bLabel="COGS" months={months.map((m) => ({ label: m.label, a: m.revenue, b: m.cogs }))} />
      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold">Month</th>
              <th className="px-4 py-2 font-semibold text-right">Revenue</th>
              <th className="px-4 py-2 font-semibold text-right">COGS</th>
              <th className="px-4 py-2 font-semibold text-right">Gross profit</th>
              <th className="px-4 py-2 font-semibold text-right">Margin</th>
              <th className="px-4 py-2 font-semibold text-right">Expenses</th>
              <th className="px-4 py-2 font-semibold text-right">Operating profit</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const mm = m.revenue > 0 ? Math.round((m.gross / m.revenue) * 1000) / 10 : null;
              return (
                <tr key={m.label} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{m.label}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-leaf">{m.row ? formatPHP(m.revenue) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{m.row ? formatPHP(m.cogs) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">{m.row ? formatPHP(m.gross) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{mm != null ? `${mm}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-coral">{m.row ? formatPHP(m.opex) : "—"}</td>
                  <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums font-semibold", m.op >= 0 ? "text-ink" : "text-coral")}>{m.row ? formatPHP(m.op) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-cream/40 font-semibold">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-leaf">{formatPHP(tRev)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{formatPHP(tCogs)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatPHP(tGross)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">{margin}%</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-coral">{formatPHP(tOpex)}</td>
              <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums", tOp >= 0 ? "text-ink" : "text-coral")}>{formatPHP(tOp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-inkSoft px-1">
        Juice operating P&amp;L: revenue and cost of goods for cans sold, less operating expenses.
        Event/ticket &amp; other income aren&apos;t included here (see Cash flow). Some early-2026
        historical batches use estimated ingredient costs.
      </p>
    </>
  );
}

// ── Shared inline-SVG two-series bar chart ──────────────────────
function ChartCard({
  months,
  aLabel,
  bLabel,
}: {
  months: Array<{ label: string; a: number; b: number }>;
  aLabel: string;
  bLabel: string;
}) {
  const W = 720, H = 240, padL = 8, padR = 8, padTop = 12, padBottom = 24;
  const plotW = W - padL - padR, plotH = H - padTop - padBottom;
  const max = Math.max(1, ...months.map((m) => Math.max(m.a, m.b)));
  const groupW = plotW / months.length;
  const barW = Math.min(16, groupW / 2 - 3);
  const y = (v: number) => padTop + plotH - (v / max) * plotH;

  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-5">
      <div className="flex items-center gap-4 mb-3 text-xs text-inkSoft">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-leaf inline-block" /> {aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-coral inline-block" /> {bLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${aLabel} vs ${bLabel} by month`}>
        <line x1={padL} y1={padTop + plotH} x2={W - padR} y2={padTop + plotH} stroke="var(--color-border, #e5e0d8)" strokeWidth="1" />
        {months.map((m, i) => {
          const cx = padL + groupW * i + groupW / 2;
          return (
            <g key={m.label}>
              {m.a > 0 ? <rect x={cx - barW - 1} y={y(m.a)} width={barW} height={padTop + plotH - y(m.a)} rx="2" fill="var(--color-leaf, #4a9d5b)" /> : null}
              {m.b > 0 ? <rect x={cx + 1} y={y(m.b)} width={barW} height={padTop + plotH - y(m.b)} rx="2" fill="var(--color-coral, #e0654f)" /> : null}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-inkSoft, #8a8178)">{m.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
