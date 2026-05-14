import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { KpiCard } from "@/components/ui/kpi-card";
import { hasRole, OWNER_PARTNER, type Role } from "@/lib/roles";

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

  const { data: roleRow } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id).single()
    : { data: null };
  const role = (roleRow?.role as Role | null) ?? null;
  const canSeeFinancials = hasRole(role, OWNER_PARTNER);

  const today = new Date().toISOString().slice(0, 10);

  // Always fetch operational counts. Skip the balances query for roles that
  // can't see the financial KPI — saves a round-trip and tightens the
  // information surface (RLS would block it anyway, but explicit > implicit).
  const [
    { count: orderCount },
    { count: pendingOrders },
    { count: ticketsToday },
    { count: openShifts },
    balancesRes,
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("fulfillment_status", "Pending"),
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("event_date", today),
    supabase
      .from("pos_shifts")
      .select("*", { count: "exact", head: true })
      .is("closed_at", null)
      .is("deleted_at", null),
    canSeeFinancials
      ? supabase.from("account_balances").select("code, current_balance")
      : Promise.resolve({ data: null as { current_balance: number | string }[] | null }),
  ]);

  const totalCash = canSeeFinancials
    ? (balancesRes.data ?? []).reduce(
        (sum, b) => sum + Number(b.current_balance ?? 0),
        0,
      )
    : 0;

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
        {canSeeFinancials ? (
          <KpiCard
            label="Total balances"
            value={formatPHP(totalCash)}
            accent="berry"
            sub="all accounts combined"
          />
        ) : (
          <KpiCard
            label="Active shifts"
            value={openShifts ?? 0}
            accent="berry"
            sub="POS shifts currently open"
          />
        )}
      </div>

      <section className="bg-white border border-border rounded-lg shadow-card p-6">
        <h2 className="font-serif font-bold text-lg text-ink mb-1">
          NJJ OS — live <span aria-hidden>✓</span>
        </h2>
        <p className="text-sm text-inkSoft mb-4">
          Auth, role gating, every Phase 2 module shipped. Tickets and remaining settings come next.
        </p>
        <ul className="text-sm text-inkSoft space-y-1 list-disc list-inside">
          <li>Sign-in goes through Supabase Auth — RLS enforced on every read.</li>
          <li>The sidebar shows only what your role can access.</li>
          <li>The KPIs above run as live queries against the Postgres views.</li>
        </ul>
      </section>
    </div>
  );
}
