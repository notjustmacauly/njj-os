"use client";

import * as React from "react";
import Link from "next/link";
import { Combobox } from "@/components/ui/combobox";
import { cn, formatDate, formatPHP } from "@/lib/utils";

export type BillRow = {
  id: string;
  external_id: string | null;
  bill_date: string;
  due_date: string | null;
  status: "draft" | "issued" | "paid" | "cancelled";
  subtotal: number;
  total: number;
  paid_amount: number;
  paid_date: string | null;
  paid_account_code: string | null;
  partner_id: string;
  partner_name: string;
  wix_invoice_url: string | null;
};

const STATUS_TONE: Record<BillRow["status"], string> = {
  draft: "bg-creamDk text-inkSoft",
  issued: "bg-yellowBg text-yellow",
  paid: "bg-greenBg text-green",
  cancelled: "bg-creamDk text-inkSoft",
};

function isOverdue(b: BillRow): boolean {
  if (b.status !== "issued" || !b.due_date) return false;
  const due = new Date(`${b.due_date}T00:00:00+08:00`);
  return due.getTime() < Date.now();
}

export function BillsList({ rows }: { rows: BillRow[] }) {
  const [partnerFilter, setPartnerFilter] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<Set<BillRow["status"]>>(
    new Set(["draft", "issued"] as BillRow["status"][]),
  );
  const [overdueOnly, setOverdueOnly] = React.useState(false);

  const partners = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (!m.has(r.partner_id)) m.set(r.partner_id, r.partner_name);
    return Array.from(m.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  function toggleStatus(s: BillRow["status"]) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = rows.filter((r) => {
    if (partnerFilter && r.partner_id !== partnerFilter) return false;
    if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
    if (overdueOnly && !isOverdue(r)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem]">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
              Partner
            </div>
            <Combobox
              ariaLabel="Partner"
              value={partnerFilter}
              onChange={setPartnerFilter}
              options={partners}
              placeholder="All partners"
              emptyMessage="No partners with bills"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft mb-1">
              Status
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["draft", "issued", "paid", "cancelled"] as BillRow["status"][]).map((s) => {
                const on = statusFilter.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md border transition capitalize",
                      on
                        ? "bg-berry text-white border-berry"
                        : "bg-white text-inkSoft border-border hover:bg-cream",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="text-sm text-inkSoft inline-flex items-center gap-1.5 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Overdue only
          </label>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-36">Bill #</th>
              <th className="px-4 py-2 font-semibold">Partner</th>
              <th className="px-4 py-2 font-semibold w-28">Bill date</th>
              <th className="px-4 py-2 font-semibold w-28">Due</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Subtotal</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Paid</th>
              <th className="px-4 py-2 font-semibold w-24">Status</th>
              <th className="px-4 py-2 font-semibold w-20">Wix</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No bills match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const overdue = isOverdue(r);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-cream/30">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <Link
                        href={`/dashboard/finance/bills/${r.id}`}
                        className="text-ink hover:text-berry"
                      >
                        {r.external_id ?? r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink font-semibold">{r.partner_name}</td>
                    <td className="px-4 py-2.5 text-xs text-inkSoft whitespace-nowrap">
                      {formatDate(r.bill_date)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-xs whitespace-nowrap",
                        overdue ? "text-coral font-semibold" : "text-inkSoft",
                      )}
                    >
                      {r.due_date ? formatDate(r.due_date) : "—"}
                      {overdue ? " · overdue" : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatPHP(r.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {r.paid_amount > 0 ? formatPHP(r.paid_amount) : <span className="text-inkSoft">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                          STATUS_TONE[r.status],
                        )}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.wix_invoice_url ? (
                        <a
                          href={r.wix_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-berry hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-inkSoft">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-inkSoft px-1">
        Bill creation lands in Phase 3 with the receivables → bill RPC. View, issue, pay, and
        cancel are available now for bills created via other paths.
      </p>
    </div>
  );
}
