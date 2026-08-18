import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/ui/kpi-card";
import { formatPHP } from "@/lib/utils";
import { OWNER_PARTNER_MANAGER, type Role } from "@/lib/roles";

export const dynamic = "force-dynamic";

type Summary = {
  outstanding: number;
  billed: number;
  unbilled: number;
  overdue: number;
  count: number;
  open_bills: number;
};

export default async function BillingDashboardPage() {
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
  if (!role || !OWNER_PARTNER_MANAGER.includes(role)) redirect("/dashboard");

  const { data } = await supabase.rpc("billing_summary");
  const s = (data ?? { outstanding: 0, billed: 0, unbilled: 0, overdue: 0, count: 0, open_bills: 0 }) as Summary;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink">
          <span aria-hidden className="mr-2">🧾</span>
          Billing
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          What partners owe us — outstanding, billed, and overdue. Draft and track bills here.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total outstanding"
          value={formatPHP(s.outstanding)}
          sub={`${s.count} receivable${s.count === 1 ? "" : "s"} owed`}
          accent="berry"
        />
        <KpiCard
          label="Total billed"
          value={formatPHP(s.billed)}
          sub={`on ${s.open_bills} open bill${s.open_bills === 1 ? "" : "s"}`}
          accent="peri"
        />
        <KpiCard
          label="Unbilled"
          value={formatPHP(s.unbilled)}
          sub="delivered — needs a bill"
          accent="green"
        />
        <KpiCard
          label="Overdue"
          value={formatPHP(s.overdue)}
          sub="past due date"
          accent="coral"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/finance/receivables"
          className="group bg-white border border-border rounded-lg shadow-card p-5 hover:border-berry/40 transition"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-serif font-bold text-lg text-ink">Receivables</h2>
            <ArrowRight className="w-4 h-4 text-inkSoft group-hover:text-berry transition" />
          </div>
          <p className="text-sm text-inkSoft mt-1">
            Delivered orders awaiting payment. Select a partner&rsquo;s items to draft a bill.
          </p>
        </Link>
        <Link
          href="/dashboard/finance/bills"
          className="group bg-white border border-border rounded-lg shadow-card p-5 hover:border-berry/40 transition"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-serif font-bold text-lg text-ink">Bills</h2>
            <ArrowRight className="w-4 h-4 text-inkSoft group-hover:text-berry transition" />
          </div>
          <p className="text-sm text-inkSoft mt-1">
            Issued invoices — track status, add adjustments, and email them to partners.
          </p>
        </Link>
      </div>
    </div>
  );
}
