import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { hasRole, OWNER_PARTNER, type Role } from "@/lib/roles";
import { KpiCard } from "@/components/ui/kpi-card";
import { UrlSelect } from "@/components/ui/url-filters";
import { EmptyState } from "@/components/ui/empty-state";

// Phase 1 of Reports: monthly CASH-FLOW. Money in vs out per month, by
// occurred_at (economic date), from report_monthly_cashflow(). Profit/COGS
// is Phase 2. Owner/partner only.

type Row = {
  month: string;
  cash_in: number | string;
  cash_out: number | string;
  net: number | string;
  sales: number | string;
  refunds: number | string;
  other_income: number | string;
  opex: number | string;
  inventory: number | string;
  other_out: number | string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function n(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

type MonthCell = { label: string; in: number; out: number; net: number; row: Row | null };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { year?: string };
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
  const role = (roleRow?.role as Role | null) ?? null;
  if (!hasRole(role, OWNER_PARTNER)) redirect("/dashboard/finance");

  const { data } = await supabase.rpc("report_monthly_cashflow");
  const rows = (data ?? []) as Row[];

  const years = Array.from(new Set(rows.map((r) => r.month.slice(0, 4)))).sort((a, b) => b.localeCompare(a));
  const selectedYear = searchParams?.year && years.includes(searchParams.year)
    ? searchParams.year
    : years[0] ?? String(new Date().getFullYear());

  const byMonthKey = new Map(rows.map((r) => [r.month.slice(0, 7), r]));
  const months: MonthCell[] = MONTHS.map((label, i) => {
    const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
    const row = byMonthKey.get(key) ?? null;
    return {
      label,
      in: row ? n(row.cash_in) : 0,
      out: row ? n(row.cash_out) : 0,
      net: row ? n(row.net) : 0,
      row,
    };
  });

  const totalIn = months.reduce((s, m) => s + m.in, 0);
  const totalOut = months.reduce((s, m) => s + m.out, 0);
  const totalNet = totalIn - totalOut;

  const yearOptions = [
    ...years.map((y) => ({ value: y, label: y })),
  ];
  if (yearOptions.length === 0) yearOptions.push({ value: selectedYear, label: selectedYear });

  const hasData = rows.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-berry" />
            Reports
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Monthly cash flow — money in vs out, by the date each entry actually occurred.
          </p>
        </div>
        <div className="w-36">
          <UrlSelect paramKey="year" options={yearOptions} ariaLabel="Year" />
        </div>
      </header>

      {!hasData ? (
        <EmptyState emoji="📊" title="No financial activity yet" description="Once money moves through the ledger, monthly figures appear here." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label={`Money in · ${selectedYear}`} value={formatPHP(totalIn)} accent="green" sub="sales, refunds, other income" />
            <KpiCard label={`Money out · ${selectedYear}`} value={formatPHP(totalOut)} accent="coral" sub="expenses + inventory buys" />
            <KpiCard
              label={`Net · ${selectedYear}`}
              value={formatPHP(totalNet)}
              accent={totalNet >= 0 ? "berry" : "coral"}
              sub={totalNet >= 0 ? "cash surplus" : "cash deficit"}
            />
          </div>

          <div className="bg-white border border-border rounded-lg shadow-card p-5">
            <div className="flex items-center gap-4 mb-3 text-xs text-inkSoft">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-leaf inline-block" /> Money in
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-coral inline-block" /> Money out
              </span>
            </div>
            <CashflowChart months={months} />
          </div>

          <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream text-inkSoft">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold">Month</th>
                  <th className="px-4 py-2 font-semibold text-right">Sales</th>
                  <th className="px-4 py-2 font-semibold text-right">Refunds</th>
                  <th className="px-4 py-2 font-semibold text-right">Expenses</th>
                  <th className="px-4 py-2 font-semibold text-right">Inventory buys</th>
                  <th className="px-4 py-2 font-semibold text-right">Money in</th>
                  <th className="px-4 py-2 font-semibold text-right">Money out</th>
                  <th className="px-4 py-2 font-semibold text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const empty = !m.row;
                  return (
                    <tr key={m.label} className="border-t border-border">
                      <td className="px-4 py-2.5 font-medium">{m.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">
                        {empty ? "—" : formatPHP(n(m.row!.sales))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">
                        {empty ? "—" : formatPHP(n(m.row!.refunds))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">
                        {empty ? "—" : formatPHP(n(m.row!.opex))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-inkSoft">
                        {empty ? "—" : formatPHP(n(m.row!.inventory))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-leaf">
                        {empty ? "—" : formatPHP(m.in)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-coral">
                        {empty ? "—" : formatPHP(m.out)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${m.net >= 0 ? "text-ink" : "text-coral"}`}>
                        {empty ? "—" : formatPHP(m.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-cream/40 font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td colSpan={3} />
                  <td />
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-leaf">{formatPHP(totalIn)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-coral">{formatPHP(totalOut)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${totalNet >= 0 ? "text-ink" : "text-coral"}`}>
                    {formatPHP(totalNet)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[11px] text-inkSoft px-1">
            Cash-flow view. Internal transfers between your own accounts are excluded. A profit
            view (sales − cost of goods − expenses) is coming next.
          </p>
        </>
      )}
    </div>
  );
}

// ── Inline-SVG grouped bar chart (no dependency) ────────────────
function CashflowChart({ months }: { months: MonthCell[] }) {
  const W = 720;
  const H = 240;
  const padL = 8;
  const padR = 8;
  const padTop = 12;
  const padBottom = 24;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...months.map((m) => Math.max(m.in, m.out)));
  const groupW = plotW / months.length;
  const barW = Math.min(16, groupW / 2 - 3);

  function y(v: number): number {
    return padTop + plotH - (v / max) * plotH;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly cash in vs out">
      {/* baseline */}
      <line x1={padL} y1={padTop + plotH} x2={W - padR} y2={padTop + plotH} stroke="var(--color-border, #e5e0d8)" strokeWidth="1" />
      {months.map((m, i) => {
        const cx = padL + groupW * i + groupW / 2;
        const inX = cx - barW - 1;
        const outX = cx + 1;
        const inY = y(m.in);
        const outY = y(m.out);
        return (
          <g key={m.label}>
            {m.in > 0 ? (
              <rect x={inX} y={inY} width={barW} height={padTop + plotH - inY} rx="2" fill="var(--color-leaf, #4a9d5b)" />
            ) : null}
            {m.out > 0 ? (
              <rect x={outX} y={outY} width={barW} height={padTop + plotH - outY} rx="2" fill="var(--color-coral, #e0654f)" />
            ) : null}
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-inkSoft, #8a8178)">
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
