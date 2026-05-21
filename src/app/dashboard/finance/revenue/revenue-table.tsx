"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import { accountEmoji } from "../account-icons";
import { downloadCsv } from "../csv";
import { refLinkFor, REVENUE_SOURCES, sourceLabelFor } from "../ref-link";

export type RevenueEntry = {
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

type Chip = { key: string; label: string; compute: () => { from: string; to: string } };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
function weekStartIso(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function ytdStartIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const CHIPS: Chip[] = [
  { key: "this_week", label: "This week", compute: () => ({ from: weekStartIso(), to: todayIso() }) },
  { key: "this_month", label: "This month", compute: () => ({ from: monthStartIso(0), to: todayIso() }) },
  { key: "last_month", label: "Last month", compute: () => ({ from: monthStartIso(-1), to: monthEndIso(-1) }) },
  { key: "ytd", label: "Year to date", compute: () => ({ from: ytdStartIso(), to: todayIso() }) },
];

const DEFAULT_RANGE = CHIPS[1].compute(); // this month

export function RevenueTable({
  entries,
  accountNameByCode,
}: {
  entries: RevenueEntry[];
  accountNameByCode: Record<string, string>;
}) {
  const [from, setFrom] = React.useState(DEFAULT_RANGE.from);
  const [to, setTo] = React.useState(DEFAULT_RANGE.to);
  const [activeChip, setActiveChip] = React.useState("this_month");
  const [accountFilter, setAccountFilter] = React.useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = React.useState<Set<string>>(new Set());

  function applyChip(c: Chip) {
    const r = c.compute();
    setFrom(r.from);
    setTo(r.to);
    setActiveChip(c.key);
  }

  const accountOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.account_code);
    return Array.from(set).sort();
  }, [entries]);

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  const fromDate = new Date(`${from}T00:00:00+08:00`);
  const toDateExclusive = new Date(`${to}T00:00:00+08:00`);
  toDateExclusive.setDate(toDateExclusive.getDate() + 1);

  const refTypesInSourceFilter = React.useMemo(() => {
    if (sourceFilter.size === 0) return null;
    const set = new Set<string>();
    for (const s of REVENUE_SOURCES) {
      if (sourceFilter.has(s.key)) for (const rt of s.refTypes) set.add(rt);
    }
    return set;
  }, [sourceFilter]);

  const filtered = entries.filter((e) => {
    const t = new Date(e.occurred_at).getTime();
    if (t < fromDate.getTime() || t >= toDateExclusive.getTime()) return false;
    if (accountFilter.size > 0 && !accountFilter.has(e.account_code)) return false;
    if (refTypesInSourceFilter && !refTypesInSourceFilter.has(e.ref_type ?? "")) return false;
    return true;
  });

  const total = filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  function handleExport() {
    const headers = ["Date", "Account", "Description", "Source", "Ref", "Amount"];
    const rows = filtered.map((r) => [
      new Date(r.occurred_at).toISOString(),
      accountNameByCode[r.account_code] ?? r.account_code,
      r.description ?? "",
      sourceLabelFor(r.ref_type),
      r.ref_external_id ?? "",
      Number(r.amount ?? 0).toFixed(2),
    ]);
    downloadCsv(`revenue_${from}_${to}.csv`, headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => (
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
                setActiveChip("custom");
              }}
              aria-label="From date"
              className="h-8 text-xs"
            />
            <span className="text-inkSoft text-xs">→</span>
            <DateInput
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setActiveChip("custom");
              }}
              aria-label="To date"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Source
            </span>
            {REVENUE_SOURCES.map((s) => {
              const on = sourceFilter.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(sourceFilter, s.key, setSourceFilter)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-md border transition",
                    on
                      ? "bg-peri text-white border-peri"
                      : "bg-white text-inkSoft border-border hover:bg-cream",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {accountOptions.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
                Account
              </span>
              {accountOptions.map((code) => {
                const on = accountFilter.has(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggle(accountFilter, code, setAccountFilter)}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-md border transition inline-flex items-center gap-1",
                      on
                        ? "bg-berry text-white border-berry"
                        : "bg-white text-inkSoft border-border hover:bg-cream",
                    )}
                  >
                    <span aria-hidden>{accountEmoji(code)}</span>
                    {accountNameByCode[code] ?? code}
                  </button>
                );
              })}
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
              <th className="px-4 py-2 font-semibold w-28">Date</th>
              <th className="px-4 py-2 font-semibold w-40">Account</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold w-24">Source</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No revenue entries in this range.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const href = refLinkFor({
                  ref_type: r.ref_type,
                  ref_id: r.ref_id,
                  account_code: r.account_code,
                });
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {formatDate(r.occurred_at)}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      <span aria-hidden className="mr-1">
                        {accountEmoji(r.account_code)}
                      </span>
                      {accountNameByCode[r.account_code] ?? r.account_code}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={href}
                        className="text-ink hover:text-berry block truncate"
                        title={r.description ?? ""}
                      >
                        {r.description || r.ref_external_id || sourceLabelFor(r.ref_type)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-inkSoft">
                      {sourceLabelFor(r.ref_type)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-berry tabular-nums">
                      {formatPHP(r.amount)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot className="bg-cream/40 border-t border-border">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 text-xs text-inkSoft text-right font-semibold">
                  Total ({filtered.length} entries)
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-berry font-semibold tabular-nums">
                  {formatPHP(total)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Window: rolling 18 months. To see older data, ask Mac to widen the server query.
      </p>
    </div>
  );
}
