import { createClient } from "@/lib/supabase/server";
import { formatPHP } from "@/lib/utils";
import { KpiCard } from "@/components/ui/kpi-card";
import { hasRole, OWNER_PARTNER, type Role } from "@/lib/roles";
import { MyDayCard, type MyTask, type MyEvent } from "./my-day-card";
import type { ChecklistItem } from "./my-checklist";
import { ActionCenter, type ActionItem } from "./action-center";

// Always render fresh so the KPI counts reflect current data (avoid Next.js
// serving a cached, stale snapshot).
export const dynamic = "force-dynamic";

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
  // Marketing is a restricted role — they get My Day only, no operational KPIs.
  const isMarketing = role === "marketing";
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

  // My Day: my current shift + my open tasks + my personal checklist +
  // upcoming events I'm tagged in.
  let myShift: { id: string; clock_in_at: string } | null = null;
  let myTasks: MyTask[] = [];
  let myChecklist: ChecklistItem[] = [];
  let myEvents: MyEvent[] = [];
  if (user) {
    // Show events that haven't ended yet — from the start of today onwards.
    const todayStart = new Date(today + "T00:00:00+08:00").toISOString();
    const [{ data: s }, { data: ts }, { data: cl }, { data: ev }] = await Promise.all([
      supabase.from("attendance").select("id, clock_in_at").eq("user_id", user.id).is("clock_out_at", null).maybeSingle(),
      supabase
        .from("tasks")
        .select("id, board, title, status, due_date, post_date")
        .eq("assigned_to_user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("checklist_items")
        .select("id, title, cadence, weekday, completed_at, last_done_on")
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("calendar_event_attendees")
        .select("event:calendar_events!inner(id, title, event_type, starts_at, ends_at, all_day, location, deleted_at)")
        .eq("user_id", user.id),
    ]);
    myShift = (s as { id: string; clock_in_at: string } | null) ?? null;
    myTasks = ((ts ?? []) as MyTask[]).filter((t) => t.status !== "done" && t.status !== "posted");
    myChecklist = (cl ?? []) as ChecklistItem[];
    type EvJoin = { event: (MyEvent & { deleted_at: string | null }) | (MyEvent & { deleted_at: string | null })[] | null };
    myEvents = ((ev ?? []) as unknown as EvJoin[])
      .map((r) => (Array.isArray(r.event) ? r.event[0] : r.event))
      .filter((e): e is MyEvent & { deleted_at: string | null } =>
        !!e && e.deleted_at == null && (e.ends_at ?? e.starts_at) >= todayStart)
      .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
  }

  // Action center — role-based "needs your attention" counts. Counts only
  // (no amounts) so nothing leaks to amount-restricted roles. Managers/owner/
  // partner only; staff + marketing get My Day alone.
  const canBilling = role === "owner" || role === "partner" || role === "manager";
  const actions: ActionItem[] = [];
  if (canBilling) {
    const q = (p: PromiseLike<{ count: number | null }>) => Promise.resolve(p).then((r) => r.count ?? 0);
    const [payApprove, payUnpaid, reimbPending, billsIssued, recvToBill, recvOverdue, payrollDraft] = await Promise.all([
      q(supabase.from("payments").select("*", { count: "exact", head: true }).eq("type", "general").eq("status", "pending")),
      q(supabase.from("payments").select("*", { count: "exact", head: true }).eq("type", "general").eq("status", "approved")),
      q(supabase.from("payments").select("*", { count: "exact", head: true }).eq("type", "reimbursement").eq("status", "pending")),
      q(supabase.from("bills").select("*", { count: "exact", head: true }).eq("status", "issued")),
      q(supabase.from("receivables").select("*", { count: "exact", head: true }).eq("status", "pending")),
      q(supabase.from("receivables").select("*", { count: "exact", head: true }).in("status", ["pending", "billed"]).lt("due_date", today)),
      role === "owner"
        ? q(supabase.from("payroll_runs").select("*", { count: "exact", head: true }).eq("status", "draft"))
        : Promise.resolve(0),
    ]);
    const ordersPending = pendingOrders ?? 0;

    // Orders awaiting delivery — everyone operational (Hanneh moves these).
    actions.push({ label: "Orders pending delivery", count: ordersPending, href: "/dashboard/orders", accent: "yellow", hint: "Mark delivered when out" });

    if (role === "owner" || role === "partner") {
      actions.push({ label: "Payments to approve", count: payApprove, href: "/dashboard/finance/payments", accent: "coral", hint: "Awaiting your approval" });
      actions.push({ label: "Approved · to pay out", count: payUnpaid, href: "/dashboard/finance/payments", accent: "berry", hint: "Approved, not yet paid" });
      actions.push({ label: "Reimbursements to pay", count: reimbPending, href: "/dashboard/finance/reimbursements", accent: "peri" });
      actions.push({ label: "Bills to pay", count: billsIssued, href: "/dashboard/finance/bills", accent: "coral" });
    }
    if (role === "owner" || role === "manager") {
      actions.push({ label: "Receivables to bill", count: recvToBill, href: "/dashboard/finance/receivables", accent: "yellow", hint: "Ready to invoice" });
      actions.push({ label: "Overdue receivables", count: recvOverdue, href: "/dashboard/finance/receivables", accent: "coral", hint: "Past due date" });
    }
    if (role === "manager") {
      actions.push({ label: "Bills to pay", count: billsIssued, href: "/dashboard/finance/bills", accent: "peri" });
    }
    if (role === "owner") {
      actions.push({ label: "Draft payroll", count: payrollDraft, href: "/dashboard/finance/payroll", accent: "green", hint: "Review & approve" });
    }
  }

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

      {canBilling ? <ActionCenter items={actions} /> : null}

      <MyDayCard openShift={myShift} tasks={myTasks} checklist={myChecklist} events={myEvents} />

      {isMarketing ? null : (
      <>
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
      </>
      )}
    </div>
  );
}
