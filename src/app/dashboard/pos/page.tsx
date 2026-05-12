import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ActivePosClient } from "./active-pos-client";
import { OpenShiftForm } from "./open-shift-form";
import { ShiftBanner } from "./shift-banner";
import type {
  ActiveShift,
  BatchOption,
  PosBundleRef,
  PosProductRef,
  Role,
  SkuRef,
  TicketTypeRef,
} from "./types";

const POS_ROLES: Role[] = ["admin", "manager", "ops", "staff"];

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "Staff";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

type OpenShiftRow = ActiveShift & {
  staff_user_id: string | null;
};

export default async function PosPage() {
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
  if (!role || !POS_ROLES.includes(role)) {
    redirect("/dashboard");
  }

  // Look for any open shift (only one possible at a time globally per the workflow).
  const { data: openShiftsData } = await supabase
    .from("pos_shifts")
    .select(
      "id, external_id, event_name, opened_at, opening_cash, staff_name, staff_user_id, default_batch_pcl, default_batch_acg, default_batch_wpm",
    )
    .is("closed_at", null)
    .is("deleted_at", null)
    .order("opened_at", { ascending: false })
    .limit(1);

  const openShift = (openShiftsData ?? [])[0] as OpenShiftRow | undefined;
  const ownedByMe = openShift?.staff_user_id === user.id;

  // ── State 2: my own open shift → active POS interface
  if (openShift && ownedByMe) {
    const [
      { data: skusData },
      { data: ticketTypesData },
      { data: posProductsData },
      { data: posBundlesData },
    ] = await Promise.all([
      supabase
        .from("skus")
        .select("code, name, short_label, retail_price")
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("ticket_types")
        .select("code, event_category, name, price")
        .eq("is_active", true)
        .order("event_category")
        .order("name"),
      supabase
        .from("pos_products")
        .select("id, code, name, emoji, price, category, sort_order")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order")
        .order("code"),
      supabase
        .from("pos_bundles")
        .select(
          "id, code, name, emoji, price, total_cans, is_flavor_pickable, fixed_breakdown, sort_order",
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order")
        .order("code"),
    ]);

    return (
      <ActivePosClient
        shift={openShift}
        skus={(skusData ?? []) as SkuRef[]}
        ticketTypes={(ticketTypesData ?? []) as TicketTypeRef[]}
        posProducts={(posProductsData ?? []) as PosProductRef[]}
        bundles={(posBundlesData ?? []) as PosBundleRef[]}
        viewerRole={role}
      />
    );
  }

  // ── State 3: someone else has an open shift → banner
  if (openShift && !ownedByMe) {
    const { count: txnCount } = await supabase
      .from("pos_transactions")
      .select("id", { count: "exact", head: true })
      .eq("shift_id", openShift.id)
      .is("deleted_at", null);

    const { data: cashRows } = await supabase
      .from("pos_transactions")
      .select("total")
      .eq("shift_id", openShift.id)
      .eq("payment_method", "Cash")
      .is("deleted_at", null);
    const cashSales = (cashRows ?? []).reduce(
      (s, r) => s + Number((r as { total: number | string }).total ?? 0),
      0,
    );
    const expectedCash = Number(openShift.opening_cash ?? 0) + cashSales;

    return (
      <ShiftBanner
        shiftId={openShift.id}
        staffName={openShift.staff_name || "Someone"}
        eventName={openShift.event_name || ""}
        openedAtIso={openShift.opened_at}
        txnCount={txnCount ?? 0}
        expectedCash={expectedCash}
        viewerRole={role}
      />
    );
  }

  // ── State 1: no open shift → show open-shift form
  const [{ data: invData }, { data: recentShifts }] = await Promise.all([
    supabase
      .from("inventory_summary")
      .select("batch_id, batch_external_id, sku_code, remaining, batch_date")
      .gt("remaining", 0)
      .in("sku_code", ["PCL", "ACG", "WPM"])
      .order("batch_date", { ascending: true }),
    supabase
      .from("pos_shifts")
      .select("event_name, opened_at")
      .not("event_name", "is", null)
      .is("deleted_at", null)
      .order("opened_at", { ascending: false })
      .limit(20),
  ]);

  const batchesBySku: Record<"PCL" | "ACG" | "WPM", BatchOption[]> = {
    PCL: [],
    ACG: [],
    WPM: [],
  };
  for (const r of (invData ?? []) as Array<{
    batch_id: string;
    batch_external_id: string;
    sku_code: string;
    remaining: number;
  }>) {
    const sku = r.sku_code as "PCL" | "ACG" | "WPM";
    if (!batchesBySku[sku]) continue;
    batchesBySku[sku].push({
      batch_id: r.batch_id,
      external_id: r.batch_external_id,
      remaining: r.remaining,
      sku_code: r.sku_code,
    });
  }

  // Dedupe recent event names, preserve recency order.
  const seen = new Set<string>();
  const recentEventNames: string[] = [];
  for (const r of (recentShifts ?? []) as Array<{ event_name: string | null }>) {
    const n = (r.event_name || "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    recentEventNames.push(n);
    if (recentEventNames.length >= 8) break;
  }

  return (
    <OpenShiftForm
      defaultStaffName={displayNameFromEmail(user.email ?? "")}
      recentEventNames={recentEventNames}
      batchesBySku={batchesBySku}
    />
  );
}
