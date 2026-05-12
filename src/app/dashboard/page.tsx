import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { KpiCard } from "@/components/ui/kpi-card";

function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "there";
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: orderCount },
    { count: pendingOrders },
    { data: balances },
    { count: ticketsToday },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("fulfillment_status", "Pending"),
    supabase.from("account_balances").select("code, current_balance"),
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_date", today),
  ]);

  const totalCash = (balances ?? []).reduce(
    (sum, b) => sum + Number(b.current_balance ?? 0),
    0,
  );

  const name = displayNameFromEmail(user?.email);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink">
          Welcome back, {name} <span aria-hidden>🍊</span>
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          The new Supabase-backed system, live.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total orders"
          value={orderCount ?? 0}
          accent="peri"
          sub="across all time"
        />
        <KpiCard
          label="Pending orders"
          value={pendingOrders ?? 0}
          accent="yellow"
          sub="awaiting fulfillment"
        />
        <KpiCard
          label="Tickets today"
          value={ticketsToday ?? 0}
          accent="peri"
          sub="for today's events"
        />
        <KpiCard
          label="Total balances"
          value={formatPHP(totalCash)}
          accent="berry"
          sub="all accounts combined"
        />
      </div>

      <section className="bg-white border border-border rounded-lg shadow-card p-6">
        <h2 className="font-serif font-bold text-lg text-ink mb-1">
          Phase 2a is live <span aria-hidden>✓</span>
        </h2>
        <p className="text-sm text-inkSoft mb-4">
          Auth + role gating + dashboard skeleton are working. Module pages come next.
        </p>
        <ul className="text-sm text-inkSoft space-y-1 list-disc list-inside">
          <li>Sign-in goes through Supabase Auth — RLS enforced on every read.</li>
          <li>Sidebar shows only what your role can access.</li>
          <li>The four KPIs above are live queries against the Postgres views.</li>
        </ul>
      </section>
    </div>
  );
}
