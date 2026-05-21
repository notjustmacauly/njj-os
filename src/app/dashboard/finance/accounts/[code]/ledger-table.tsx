"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import { downloadCsv } from "../../csv";
import { refLinkFor, sourceLabelFor } from "../../ref-link";

export type LedgerRow = {
  id: string;
  occurred_at: string;
  account_code: string;
  direction: "in" | "out";
  amount: number | string;
  ref_type: string | null;
  ref_id: string | null;
  ref_external_id: string | null;
  description: string | null;
};

type DirectionFilter = "all" | "in" | "out";

type DateChip = {
  key: string;
  label: string;
  compute: () => { from: string; to: string };
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function monthStartIso(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toISOString().slice(0, 10);
}
function monthEndIso(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return d.toISOString().slice(0, 10);
}
function ytdStartIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const DATE_CHIPS: DateChip[] = [
  { key: "7d", label: "7 days", compute: () => ({ from: daysAgoIso(7), to: todayIso() }) },
  { key: "30d", label: "30 days", compute: () => ({ from: daysAgoIso(30), to: todayIso() }) },
  { key: "this_month", label: "This month", compute: () => ({ from: monthStartIso(0), to: todayIso() }) },
  { key: "last_month", label: "Last month", compute: () => ({ from: monthStartIso(-1), to: monthEndIso(-1) }) },
  { key: "ytd", label: "Year to date", compute: () => ({ from: ytdStartIso(), to: todayIso() }) },
];

const DEFAULT_RANGE = DATE_CHIPS[1].compute(); // 30 days

export function LedgerTable({
  accountCode,
  accountName,
  openingBalance,
  entries,
}: {
  accountCode: string;
  accountName: string;
  openingBalance: number;
  entries: LedgerRow[];
}) {
  const [from, setFrom] = React.useState<string>(DEFAULT_RANGE.from);
  const [to, setTo] = React.useState<string>(DEFAULT_RANGE.to);
  const [activeChip, setActiveChip] = React.useState<string>("30d");
  const [direction, setDirection] = React.useState<DirectionFilter>("all");
  const [refTypeFilter, setRefTypeFilter] = React.useState<Set<string>>(new Set());

  function applyChip(c: DateChip) {
    const range = c.compute();
    setFrom(range.from);
    setTo(range.to);
    setActiveChip(c.key);
  }
  function onCustomDateChange() {
    setActiveChip("custom");
  }

  // Available ref_types in this dataset for the filter dropdown.
  const refTypeOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of entries) if (r.ref_type) set.add(r.ref_type);
    return Array.from(set).sort();
  }, [entries]);

  function toggleRefType(rt: string) {
    setRefTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(rt)) next.delete(rt);
      else next.add(rt);
      return next;
    });
  }

  // Compute running balance across all entries (sorted ASC), then build the
  // display rows by filtering. Opening-balance row is prepended if it falls
  // inside the active date window.
  const allWithBalance = React.useMemo(() => {
    let acc = openingBalance;
    return entries.map((e) => {
      const amount = Number(e.amount ?? 0);
      acc += e.direction === "in" ? amount : -amount;
      return { ...e, running: acc };
    });
  }, [entries, openingBalance]);

  const fromDate = new Date(`${from}T00:00:00+08:00`);
  const toDateExclusive = new Date(`${to}T00:00:00+08:00`);
  toDateExclusive.setDate(toDateExclusive.getDate() + 1);

  const filteredRows = allWithBalance.filter((r) => {
    const occurred = new Date(r.occurred_at);
    if (occurred < fromDate) return false;
    if (occurred >= toDateExclusive) return false;
    if (direction !== "all" && r.direction !== direction) return false;
    if (refTypeFilter.size > 0 && !refTypeFilter.has(r.ref_type ?? "")) return false;
    return true;
  });

  // Sort filtered rows DESC for display (newest at top).
  const displayRows = [...filteredRows].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  const totalIn = filteredRows.reduce(
    (s, r) => (r.direction === "in" ? s + Number(r.amount ?? 0) : s),
    0,
  );
  const totalOut = filteredRows.reduce(
    (s, r) => (r.direction === "out" ? s + Number(r.amount ?? 0) : s),
    0,
  );

  function handleExport() {
    const filenameDate = `${from}_${to}`;
    const headers = ["Date", "Description", "Source", "Ref", "In", "Out", "Running balance"];
    const rows = displayRows.map((r) => [
      new Date(r.occurred_at).toISOString(),
      r.description ?? "",
      sourceLabelFor(r.ref_type),
      r.ref_external_id ?? "",
      r.direction === "in" ? Number(r.amount ?? 0).toFixed(2) : "",
      r.direction === "out" ? Number(r.amount ?? 0).toFixed(2) : "",
      r.running.toFixed(2),
    ]);
    downloadCsv(`ledger_${accountCode}_${filenameDate}.csv`.replace(/\s+/g, "_"), headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {DATE_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => applyChip(c)}
              className={cn(
                "px-3 py-1 text-xs rounded-full border transition",
                activeChip === c.key
                  ? "bg-berry text-white border-berry"
                  : "bg-white text-inkSoft border-border hover:bg-cream",
              )}
            >
              {c.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <DateInput
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                onCustomDateChange();
              }}
              aria-label="From date"
              className="h-8 text-xs"
            />
            <span className="text-inkSoft text-xs">→</span>
            <DateInput
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                onCustomDateChange();
              }}
              aria-label="To date"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Direction
            </span>
            {(["all", "in", "out"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-md border transition",
                  direction === d
                    ? "bg-berry text-white border-berry"
                    : "bg-white text-inkSoft border-border hover:bg-cream",
                )}
              >
                {d === "all" ? "All" : d === "in" ? "In" : "Out"}
              </button>
            ))}
          </div>

          {refTypeOptions.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
                Ref type
              </span>
              {refTypeOptions.map((rt) => {
                const on = refTypeFilter.has(rt);
                return (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => toggleRefType(rt)}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-md border transition",
                      on
                        ? "bg-peri text-white border-peri"
                        : "bg-white text-inkSoft border-border hover:bg-cream",
                    )}
                  >
                    {sourceLabelFor(rt)}
                  </button>
                );
              })}
              {refTypeFilter.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setRefTypeFilter(new Set())}
                  className="text-xs text-berry hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-32">Date</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold w-32">Ref</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">In</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Out</th>
              <th className="px-4 py-2 font-semibold w-32 text-right">Running balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row, shown when the date window includes the very
                beginning of activity OR when there are no prior entries. */}
            <tr className="border-t border-border bg-cream/30 italic text-inkSoft">
              <td className="px-4 py-2.5 text-xs font-mono">—</td>
              <td className="px-4 py-2.5">Opening balance</td>
              <td className="px-4 py-2.5">—</td>
              <td className="px-4 py-2.5 text-right font-mono">—</td>
              <td className="px-4 py-2.5 text-right font-mono">—</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatPHP(openingBalance)}
              </td>
            </tr>
            {displayRows.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-inkSoft">
                  No entries in this range.
                </td>
              </tr>
            ) : (
              displayRows.map((r) => {
                const href = refLinkFor({
                  ref_type: r.ref_type,
                  ref_id: r.ref_id,
                  account_code: r.account_code,
                });
                const amount = Number(r.amount ?? 0);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {formatDate(r.occurred_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={href}
                        className="text-ink hover:text-berry block truncate"
                        title={r.description ?? ""}
                      >
                        {r.description || sourceLabelFor(r.ref_type)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-inkSoft truncate">
                      {r.ref_external_id ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-berry tabular-nums">
                      {r.direction === "in" ? formatPHP(amount) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-coral tabular-nums">
                      {r.direction === "out" ? formatPHP(amount) : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatPHP(r.running)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {displayRows.length > 0 ? (
            <tfoot className="bg-cream/40 border-t border-border font-semibold">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-xs text-inkSoft text-right">
                  Filtered totals
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-berry tabular-nums">
                  {formatPHP(totalIn)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-coral tabular-nums">
                  {formatPHP(totalOut)}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-inkSoft">
                  Net {formatPHP(totalIn - totalOut)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Running balance for {accountName} is computed forward from the opening balance across the
        full ledger. Filters narrow the visible rows but keep the running total honest.
      </p>
      <Link
        href={`/dashboard/finance/accounts`}
        className={buttonClasses({ variant: "ghost", size: "sm", className: "self-start" })}
      >
        ← All accounts
      </Link>
    </div>
  );
}
