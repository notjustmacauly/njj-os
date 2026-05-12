"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPHP } from "@/lib/utils";
import { refLinkFor } from "./ref-link";
import { accountEmoji } from "./account-icons";

export type ActivityRow = {
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

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityFeed({
  initial,
  accountNameByCode,
}: {
  initial: ActivityRow[];
  accountNameByCode: Record<string, string>;
}) {
  const [rows, setRows] = React.useState<ActivityRow[]>(initial);

  const refetch = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("ledger_entries")
      .select(
        "id, occurred_at, account_code, direction, amount, ref_type, ref_id, ref_external_id, description",
      )
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    setRows((data ?? []) as ActivityRow[]);
  }, []);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("finance-activity-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ledger_entries" },
        () => {
          refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-card p-8 text-center text-sm text-inkSoft">
        No activity yet. POS shifts, expenses and paid orders will appear here.
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-lg shadow-card overflow-hidden">
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const accountName = accountNameByCode[r.account_code] ?? r.account_code;
          const href = refLinkFor({
            ref_type: r.ref_type,
            ref_id: r.ref_id,
            account_code: r.account_code,
          });
          const isIn = r.direction === "in";
          const amount = Number(r.amount ?? 0);
          return (
            <li key={r.id}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-cream/40 transition"
              >
                <span
                  aria-hidden
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isIn ? "bg-berryBg text-berry" : "bg-salmonBg text-coral"
                  }`}
                >
                  {isIn ? (
                    <ArrowDownLeft className="w-4 h-4" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink truncate">
                    {r.description || r.ref_external_id || "Ledger entry"}
                  </div>
                  <div className="text-xs text-inkSoft truncate font-mono">
                    {formatStamp(r.occurred_at)} ·{" "}
                    <span aria-hidden>{accountEmoji(r.account_code)}</span> {accountName}
                  </div>
                </div>
                <div
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isIn ? "text-berry" : "text-coral"
                  }`}
                >
                  {isIn ? "+" : "−"}
                  {formatPHP(amount)}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
