import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { accountEmoji } from "../../account-icons";
import { LedgerTable, type LedgerRow } from "./ledger-table";

type Role = "admin" | "manager" | "ops" | "staff";
const FINANCE_ROLES: Role[] = ["admin", "manager", "ops"];

function todayManilaStartUtc(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return new Date(`${fmt.format(new Date())}T00:00:00+08:00`);
}

export default async function AccountLedgerPage({
  params,
}: {
  params: { code: string };
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
  const role = roleRow?.role as Role | null;
  if (!role || !FINANCE_ROLES.includes(role)) redirect("/dashboard");

  const code = decodeURIComponent(params.code);

  const [{ data: account }, { data: balance }, { data: entries }] = await Promise.all([
    supabase
      .from("accounts")
      .select("code, name, opening_balance, is_active")
      .eq("code", code)
      .maybeSingle(),
    supabase
      .from("account_balances")
      .select("current_balance, last_activity_at")
      .eq("code", code)
      .maybeSingle(),
    supabase
      .from("ledger_entries")
      .select(
        "id, occurred_at, account_code, direction, amount, ref_type, ref_id, ref_external_id, description",
      )
      .eq("account_code", code)
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (!account) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/finance/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to accounts
        </Link>
        <p className="text-sm text-inkSoft">Account &ldquo;{code}&rdquo; not found.</p>
      </div>
    );
  }

  const openingBalance = Number(account.opening_balance ?? 0);
  const currentBalance = Number(balance?.current_balance ?? openingBalance);

  // Today's net by walking just the latest day's slice.
  const todayStart = todayManilaStartUtc();
  let todayNet = 0;
  for (const r of (entries ?? []) as LedgerRow[]) {
    if (new Date(r.occurred_at).getTime() >= todayStart.getTime()) {
      const a = Number(r.amount ?? 0);
      todayNet += r.direction === "in" ? a : -a;
    }
  }

  const netTone =
    todayNet > 0 ? "text-berry" : todayNet < 0 ? "text-coral" : "text-inkSoft";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/finance/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to accounts
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
              <span aria-hidden>{accountEmoji(account.code)}</span>
              {account.name}
            </h1>
            <p className="text-xs text-inkSoft mt-1 font-mono">{account.code}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
              Current balance
            </div>
            <div className="font-serif font-bold text-3xl text-berry tabular-nums">
              {formatPHP(currentBalance)}
            </div>
            <div className={`text-xs font-mono mt-0.5 ${netTone}`}>
              {todayNet === 0
                ? "No movement today"
                : `${todayNet > 0 ? "+" : "−"}${formatPHP(Math.abs(todayNet))} today`}
            </div>
            <div className="text-[11px] text-inkSoft mt-0.5">
              Opening {formatPHP(openingBalance)}
            </div>
          </div>
        </div>
      </div>

      <LedgerTable
        accountCode={account.code}
        accountName={account.name}
        openingBalance={openingBalance}
        entries={(entries ?? []) as LedgerRow[]}
      />
    </div>
  );
}
