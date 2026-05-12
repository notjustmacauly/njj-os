import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AccountCard, type AccountCardData } from "./account-card";

type Role = "admin" | "manager" | "ops" | "staff";
const FINANCE_ROLES: Role[] = ["admin", "manager", "ops"];

function todayManilaStartUtc(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = fmt.format(new Date());
  // Asia/Manila is UTC+8 with no DST.
  return new Date(`${dateStr}T00:00:00+08:00`);
}

export default async function FinanceAccountsPage() {
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

  const todayStart = todayManilaStartUtc();

  const [{ data: balances }, { data: todayRows }] = await Promise.all([
    supabase
      .from("account_balances")
      .select(
        "id, code, name, opening_balance, total_in, total_out, current_balance, last_activity_at, is_active",
      )
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("ledger_entries")
      .select("account_code, direction, amount")
      .gte("occurred_at", todayStart.toISOString()),
  ]);

  // Today's net by account.
  const netByAccount: Record<string, number> = {};
  for (const r of (todayRows ?? []) as Array<{
    account_code: string;
    direction: "in" | "out";
    amount: number | string;
  }>) {
    const a = Number(r.amount ?? 0);
    netByAccount[r.account_code] = (netByAccount[r.account_code] ?? 0) + (r.direction === "in" ? a : -a);
  }

  const cards: AccountCardData[] = ((balances ?? []) as Array<{
    code: string;
    name: string;
    opening_balance: number | string;
    current_balance: number | string;
    last_activity_at: string | null;
  }>).map((b) => ({
    code: b.code,
    name: b.name,
    opening_balance: Number(b.opening_balance ?? 0),
    current_balance: Number(b.current_balance ?? 0),
    today_net: netByAccount[b.code] ?? 0,
    last_activity_at: b.last_activity_at,
  }));

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/finance"
          className="inline-flex items-center gap-1.5 text-sm text-inkSoft hover:text-ink mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Finance
        </Link>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">🏦</span>
          Accounts
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Live balances from the ledger. Click a card for full history.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="bg-white border border-border rounded-lg shadow-card p-8 text-center text-sm text-inkSoft">
          No active accounts.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c) => (
            <AccountCard key={c.code} data={c} canEditOpening={role === "admin"} />
          ))}
        </div>
      )}
    </div>
  );
}
