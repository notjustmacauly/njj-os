"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { cn, formatDate, formatPHP } from "@/lib/utils";
import { accountEmoji } from "../account-icons";
import type { Role } from "@/lib/roles";
import { ExpenseFormModal } from "./expense-form-modal";
import { ExpenseDetailModal } from "./expense-detail-modal";

export type ExpenseRow = {
  id: string;
  external_id: string | null;
  expense_date: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number | string;
  account_code: string;
  payment_ref: string | null;
  receipt_url: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  logged_by_name: string | null;
  created_at: string;
};

type StatusFilter = "active" | "voided" | "all";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function ExpensesView({
  role,
  canManage,
  canVoid,
  defaultLoggedByName,
  accounts,
  allowedAccounts,
  expenses,
}: {
  role: Role;
  canManage: boolean;
  canVoid: boolean;
  defaultLoggedByName: string;
  accounts: Array<{ code: string; name: string }>;
  allowedAccounts: Array<{ code: string; name: string }>;
  expenses: ExpenseRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const highlight = params.get("highlight");

  const [from, setFrom] = React.useState(daysAgoIso(30));
  const [to, setTo] = React.useState(todayIso());
  const [categories, setCategories] = React.useState<Set<string>>(new Set());
  const [accountCodes, setAccountCodes] = React.useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("active");
  const [showCreate, setShowCreate] = React.useState(false);
  const [openDetail, setOpenDetail] = React.useState<ExpenseRow | null>(null);

  // If linked from the activity feed via ?highlight=, auto-open that detail.
  React.useEffect(() => {
    if (!highlight) return;
    const row = expenses.find((e) => e.id === highlight);
    if (row) setOpenDetail(row);
  }, [highlight, expenses]);

  const availableCategories = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) set.add(e.category);
    return Array.from(set).sort();
  }, [expenses]);

  const fromDate = new Date(`${from}T00:00:00+08:00`);
  const toDateExclusive = new Date(`${to}T00:00:00+08:00`);
  toDateExclusive.setDate(toDateExclusive.getDate() + 1);

  const filtered = expenses.filter((e) => {
    const expDate = new Date(`${e.expense_date}T00:00:00+08:00`);
    if (expDate < fromDate || expDate >= toDateExclusive) return false;
    if (statusFilter === "active" && e.voided_at) return false;
    if (statusFilter === "voided" && !e.voided_at) return false;
    if (categories.size > 0 && !categories.has(e.category)) return false;
    if (accountCodes.size > 0 && !accountCodes.has(e.account_code)) return false;
    return true;
  });

  const activeTotal = filtered
    .filter((e) => !e.voided_at)
    .reduce((s, e) => s + Number(e.amount ?? 0), 0);

  function toggleSet<T extends string>(set: Set<T>, key: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  const accountNameByCode: Record<string, string> = {};
  for (const a of accounts) accountNameByCode[a.code] = a.name;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">🧾</span>
            Expenses
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Cash outflows you&rsquo;ve already paid. Use Payments for requests pending approval.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Log expense
          </Button>
        ) : (
          <p className="text-xs text-inkSoft">Partner and manager can view; only owner logs and voids.</p>
        )}
      </header>

      <div className="bg-white border border-border rounded-lg shadow-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              From
            </span>
            <DateInput
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-xs"
            />
            <span className="text-inkSoft text-xs">→</span>
            <DateInput
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Status
            </span>
            {(["active", "voided", "all"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-md border transition capitalize",
                  statusFilter === s
                    ? "bg-berry text-white border-berry"
                    : "bg-white text-inkSoft border-border hover:bg-cream",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {availableCategories.length > 0 ? (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft pt-1">
              Category
            </span>
            {availableCategories.map((c) => {
              const on = categories.has(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleSet(categories, c, setCategories)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-md border transition",
                    on
                      ? "bg-peri text-white border-peri"
                      : "bg-white text-inkSoft border-border hover:bg-cream",
                  )}
                >
                  {c}
                </button>
              );
            })}
            {categories.size > 0 ? (
              <button
                type="button"
                onClick={() => setCategories(new Set())}
                className="text-xs text-berry hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        {accounts.length > 0 ? (
          <div className="flex items-start gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft pt-1">
              Account
            </span>
            {accounts.map((a) => {
              const on = accountCodes.has(a.code);
              return (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => toggleSet(accountCodes, a.code, setAccountCodes)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-md border transition inline-flex items-center gap-1",
                    on
                      ? "bg-berry text-white border-berry"
                      : "bg-white text-inkSoft border-border hover:bg-cream",
                  )}
                >
                  <span aria-hidden>{accountEmoji(a.code)}</span>
                  {a.name}
                </button>
              );
            })}
            {accountCodes.size > 0 ? (
              <button
                type="button"
                onClick={() => setAccountCodes(new Set())}
                className="text-xs text-berry hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-4 py-2 font-semibold w-28">Date</th>
              <th className="px-4 py-2 font-semibold w-32">Category</th>
              <th className="px-4 py-2 font-semibold w-44">Vendor</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold w-36">Account</th>
              <th className="px-4 py-2 font-semibold w-28 text-right">Amount</th>
              <th className="px-4 py-2 font-semibold w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-inkSoft">
                  No expenses in this range.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const voided = !!r.voided_at;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setOpenDetail(r)}
                    className={cn(
                      "border-t border-border cursor-pointer transition",
                      voided ? "text-inkSoft" : "hover:bg-cream/30",
                      r.id === highlight && "bg-yellow-50",
                    )}
                  >
                    <td
                      className={cn(
                        "px-4 py-2.5 text-xs whitespace-nowrap",
                        voided && "line-through",
                      )}
                    >
                      {formatDate(r.expense_date)}
                    </td>
                    <td className={cn("px-4 py-2.5", voided && "line-through")}>{r.category}</td>
                    <td className={cn("px-4 py-2.5", voided && "line-through")}>
                      {r.vendor || "—"}
                    </td>
                    <td
                      className={cn("px-4 py-2.5 truncate", voided && "line-through")}
                      title={r.description}
                    >
                      {r.description}
                    </td>
                    <td className={cn("px-4 py-2.5 text-xs", voided && "line-through")}>
                      <span aria-hidden className="mr-1">
                        {accountEmoji(r.account_code)}
                      </span>
                      {accountNameByCode[r.account_code] ?? r.account_code}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-mono font-semibold tabular-nums",
                        voided ? "line-through" : "text-coral",
                      )}
                    >
                      {formatPHP(r.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {voided ? (
                        <span className="text-inkSoft">Voided</span>
                      ) : (
                        <span className="text-emerald-700">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot className="bg-cream/40 border-t border-border">
              <tr>
                <td colSpan={5} className="px-4 py-2.5 text-xs text-inkSoft text-right font-semibold">
                  Active total ({filtered.filter((e) => !e.voided_at).length} entries)
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-coral tabular-nums">
                  {formatPHP(activeTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <ExpenseFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        role={role}
        accounts={allowedAccounts}
        defaultLoggedByName={defaultLoggedByName}
        onSaved={() => {
          setShowCreate(false);
          router.refresh();
        }}
      />

      <ExpenseDetailModal
        expense={openDetail}
        accounts={accounts}
        canVoid={canVoid}
        onClose={() => setOpenDetail(null)}
        onVoided={() => {
          setOpenDetail(null);
          router.refresh();
        }}
      />

      <p className="text-[11px] text-inkSoft px-1">
        Window: rolling 18 months. Role: {role}. Idempotency keys are generated per
        form-open to prevent double-submits.
      </p>
    </div>
  );
}
