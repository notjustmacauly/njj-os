import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPHP } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { UrlDateRange, UrlSearch, UrlSelect } from "@/components/ui/url-filters";
import { PagerPublisher } from "@/components/pager-publisher";
import { filterAllowedAccounts } from "@/lib/allowed-accounts";
import { OrderPayCell, OrdersBulkPay, type PayableOrder } from "./orders-pay";

type OrderRow = {
  id: string;
  external_id: string | null;
  order_date: string;
  channel: "B2B" | "Retail" | "Online" | "Event";
  partner_id: string | null;
  partner: { name: string; pays_on_delivery: boolean | null } | null;
  customer_name: string | null;
  pcl_qty: number;
  acg_qty: number;
  wpm_qty: number;
  total: number | string;
  payment_status: string;
  fulfillment_status: string;
};

type ChannelTone = "berry" | "peri" | "yellow" | "coral" | "default";
const CHANNEL_TONE: Record<OrderRow["channel"], ChannelTone> = {
  B2B: "peri",
  Online: "berry",
  Retail: "yellow",
  Event: "coral",
};

const PAGE_SIZE = 50;

function asString(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default async function OrdersListPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    channel?: string;
    fulfillment?: string;
    payment?: string;
    from?: string;
    to?: string;
    partner?: string;
    page?: string;
  };
}) {
  const supabase = await createClient();

  const q = asString(searchParams?.q).trim();
  const channel = asString(searchParams?.channel).trim();
  const fulfillment = asString(searchParams?.fulfillment).trim();
  const payment = asString(searchParams?.payment).trim();
  const explicitFrom = asString(searchParams?.from).trim();
  const explicitTo = asString(searchParams?.to).trim();
  const from = explicitFrom || thirtyDaysAgoIso();
  const to = explicitTo || todayIso();
  // When searching with no explicit date range, span all dates so matches
  // aren't hidden by the default 30-day window. Explicit dates still apply.
  const searchAllDates = !!q && !explicitFrom && !explicitTo;
  const partner = asString(searchParams?.partner).trim();
  const page = Math.max(1, parseInt(asString(searchParams?.page) || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Role gating
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roleRow } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id).single()
    : { data: null };
  const role = roleRow?.role as import("@/lib/roles").Role | null;
  // Per access matrix: owner/partner/manager can create orders; staff view-only.
  const canCreate = role === "owner" || role === "partner" || role === "manager";

  // Accounts the current user may receive payment into (for quick/bulk "Mark paid").
  let payAccounts: Array<{ code: string; name: string }> = [];
  if (canCreate && user && role) {
    const { data: accountsData } = await supabase
      .from("accounts")
      .select("code, name")
      .eq("is_active", true)
      .order("name");
    payAccounts = await filterAllowedAccounts(
      supabase,
      role,
      user.id,
      (accountsData ?? []) as Array<{ code: string; name: string }>,
    );
  }

  // KPI counts (unfiltered)
  const [
    { count: pendingFulfillment },
    { count: pendingPayment },
    { count: receivableCount },
    { count: billedCount },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("fulfillment_status", "Pending"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("payment_status", "Pending"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("payment_status", "Receivable"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("payment_status", "Billed"),
  ]);

  // Pending Cans summary (sum across orders in Pending/Packed fulfillment)
  const { data: pendingCansRows } = await supabase
    .from("orders")
    .select("pcl_qty, acg_qty, wpm_qty")
    .in("fulfillment_status", ["Pending", "Packed"]);
  const pendingCans = (pendingCansRows ?? []).reduce(
    (acc, r) => ({
      pcl: acc.pcl + Number(r.pcl_qty ?? 0),
      acg: acc.acg + Number(r.acg_qty ?? 0),
      wpm: acc.wpm + Number(r.wpm_qty ?? 0),
    }),
    { pcl: 0, acg: 0, wpm: 0 },
  );

  // Filtered partner-name lookup (when ?partner=<id> is set)
  let partnerLabel: string | null = null;
  if (partner) {
    const { data: p } = await supabase
      .from("partners")
      .select("name")
      .eq("id", partner)
      .maybeSingle();
    partnerLabel = p?.name ?? null;
  }

  // Filtered order list (paginated)
  let listQuery = supabase
    .from("orders")
    .select(
      "id, external_id, order_date, channel, partner_id, partner:partners(name, pays_on_delivery), customer_name, pcl_qty, acg_qty, wpm_qty, total, payment_status, fulfillment_status",
      { count: "exact" },
    );

  if (!searchAllDates) {
    listQuery = listQuery.gte("order_date", from).lte("order_date", to);
  }

  if (channel) listQuery = listQuery.eq("channel", channel);
  if (fulfillment) listQuery = listQuery.eq("fulfillment_status", fulfillment);
  if (payment) listQuery = listQuery.eq("payment_status", payment);
  if (partner) listQuery = listQuery.eq("partner_id", partner);
  if (q) {
    // Search by external_id, customer_name, or partner name. Partner names
    // live on a joined table and PostgREST can't ilike across the join inside
    // one .or(), so resolve matching partner ids first and fold them into the
    // OR via partner_id.in.(...).
    const { data: matchedPartners } = await supabase
      .from("partners")
      .select("id")
      .ilike("name", `%${q}%`)
      .is("deleted_at", null);
    const partnerIds = (matchedPartners ?? []).map((p) => p.id as string);

    const ors = [`external_id.ilike.%${q}%`, `customer_name.ilike.%${q}%`];
    if (partnerIds.length > 0) ors.push(`partner_id.in.(${partnerIds.join(",")})`);
    listQuery = listQuery.or(ors.join(","));
  }

  const { data: ordersData, count: totalRows } = await listQuery
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const orders = (ordersData ?? []) as unknown as OrderRow[];
  const totalCount = totalRows ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Batch labels per order (one query, grouped client-side)
  const orderIds = orders.map((o) => o.id);
  const batchesByOrder: Record<string, string[]> = {};
  if (orderIds.length > 0) {
    const { data: itemsWithBatches } = await supabase
      .from("order_items")
      .select("order_id, batches:batch_id(external_id)")
      .in("order_id", orderIds)
      .not("batch_id", "is", null);
    for (const r of (itemsWithBatches ?? []) as unknown as Array<{
      order_id: string;
      batches: { external_id: string } | { external_id: string }[] | null;
    }>) {
      const b = Array.isArray(r.batches) ? r.batches[0] : r.batches;
      const ext = b?.external_id;
      if (!ext) continue;
      if (!batchesByOrder[r.order_id]) batchesByOrder[r.order_id] = [];
      if (!batchesByOrder[r.order_id].includes(ext))
        batchesByOrder[r.order_id].push(ext);
    }
  }

  const hasFilters = !!(q || channel || fulfillment || payment || partner);

  // Base query string for pagination links — preserves all current filters
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (channel) baseParams.set("channel", channel);
  if (fulfillment) baseParams.set("fulfillment", fulfillment);
  if (payment) baseParams.set("payment", payment);
  if (from) baseParams.set("from", from);
  if (to) baseParams.set("to", to);
  if (partner) baseParams.set("partner", partner);

  const channelOptions = [
    { value: "", label: "All channels" },
    { value: "B2B", label: "B2B" },
    { value: "Retail", label: "Retail" },
    { value: "Online", label: "Online" },
    { value: "Event", label: "Event" },
  ];
  const fulfillmentOptions = [
    { value: "", label: "All fulfillment" },
    { value: "Pending", label: "Pending" },
    { value: "Packed", label: "Packed" },
    { value: "Delivered", label: "Delivered" },
    { value: "Cancelled", label: "Cancelled" },
  ];
  const paymentOptions = [
    { value: "", label: "All payment" },
    { value: "Pending", label: "Pending" },
    { value: "Paid", label: "Paid" },
    { value: "Receivable", label: "Receivable" },
    { value: "Billed", label: "Billed" },
    { value: "Partial", label: "Partial" },
    { value: "Cancelled", label: "Cancelled" },
  ];

  function clearedQuery(except?: string): string {
    const params = new URLSearchParams();
    if (except === "from-to") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  const columns: Column<OrderRow>[] = [
    {
      key: "external_id",
      header: "Order ID",
      className: "w-32",
      render: (r) => (
        <Link
          href={`/dashboard/orders/${r.id}`}
          className="font-mono text-xs text-ink hover:text-berry"
        >
          {r.external_id ?? "—"}
        </Link>
      ),
    },
    {
      key: "order_date",
      header: "Date",
      className: "w-28",
      render: (r) => (
        <span className="text-xs text-inkSoft">{formatDate(r.order_date)}</span>
      ),
    },
    {
      key: "channel",
      header: "Channel",
      className: "w-20",
      render: (r) => <Badge tone={CHANNEL_TONE[r.channel]}>{r.channel}</Badge>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) =>
        r.partner ? (
          <span className="font-semibold text-ink">{r.partner.name}</span>
        ) : (
          <span className="text-ink">{r.customer_name || "Walk-in"}</span>
        ),
    },
    {
      key: "pcl",
      header: "PCL",
      className: "w-12 text-right font-mono text-xs",
      render: (r) => (r.pcl_qty > 0 ? r.pcl_qty : <span className="text-inkSoft">—</span>),
    },
    {
      key: "acg",
      header: "ACG",
      className: "w-12 text-right font-mono text-xs",
      render: (r) => (r.acg_qty > 0 ? r.acg_qty : <span className="text-inkSoft">—</span>),
    },
    {
      key: "wpm",
      header: "WPM",
      className: "w-12 text-right font-mono text-xs",
      render: (r) => (r.wpm_qty > 0 ? r.wpm_qty : <span className="text-inkSoft">—</span>),
    },
    {
      key: "total",
      header: "Total",
      className: "w-24 text-right",
      render: (r) => (
        <span className="font-semibold text-berry">{formatPHP(r.total)}</span>
      ),
    },
    {
      key: "batches",
      header: "Batches",
      render: (r) => {
        const list = batchesByOrder[r.id] ?? [];
        if (list.length === 0) return <span className="text-inkSoft">—</span>;
        return (
          <span className="text-xs text-inkSoft font-mono">{list.join(", ")}</span>
        );
      },
    },
    {
      key: "payment",
      header: "Payment",
      className: "w-28",
      render: (r) => <StatusBadge status={r.payment_status} />,
    },
    {
      key: "fulfillment",
      header: "Fulfillment",
      className: "w-28",
      render: (r) => <StatusBadge status={r.fulfillment_status} />,
    },
  ];

  // Quick "Mark paid" action per row (owner/partner/manager only).
  if (canCreate) {
    columns.push({
      key: "actions",
      header: "",
      className: "w-24 text-right",
      render: (r) => <OrderPayCell order={r as PayableOrder} accounts={payAccounts} />,
    });
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">📦</span>
            Orders
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            B2B, retail, online, and event orders.
          </p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/orders/new" className={buttonClasses()}>
            <Plus className="w-4 h-4" />
            New Order
          </Link>
        ) : null}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Pending fulfillment" value={pendingFulfillment ?? 0} accent="yellow" sub="awaiting fulfillment" />
        <KpiCard label="Pending payment" value={pendingPayment ?? 0} accent="coral" sub="not yet paid" />
        <KpiCard label="Receivable" value={receivableCount ?? 0} accent="peri" sub="delivered, awaiting billing" />
        <KpiCard label="Billed" value={billedCount ?? 0} accent="berry" sub="invoice issued" />
      </div>

      {/* Pending cans summary */}
      <div className="bg-salmonBg border border-salmon/40 rounded-lg px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
        <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
          Pending cans
        </span>
        <span><span aria-hidden>🍍</span> <span className="font-semibold">PCL:</span> <span className="font-mono">{pendingCans.pcl}</span> cans</span>
        <span><span aria-hidden>🥕</span> <span className="font-semibold">ACG:</span> <span className="font-mono">{pendingCans.acg}</span> cans</span>
        <span><span aria-hidden>🍉</span> <span className="font-semibold">WPM:</span> <span className="font-mono">{pendingCans.wpm}</span> cans</span>
      </div>

      {/* Active partner filter chip */}
      {partner && partnerLabel ? (
        <div className="bg-berryBg/50 border border-berryLt/40 rounded-md px-3 py-2 flex items-center gap-3 text-sm">
          <span className="text-xs uppercase tracking-smallcaps font-semibold text-berry">
            Filtered by partner
          </span>
          <span className="font-semibold text-ink">{partnerLabel}</span>
          <Link
            href={`/dashboard/orders${clearedQuery("from-to")}`}
            className="ml-auto text-xs text-berry hover:underline"
          >
            Clear
          </Link>
        </div>
      ) : null}

      <div className="bg-white border border-border rounded-lg shadow-card p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <UrlSearch placeholder="Search ID or customer…" />
          </div>
          <UrlSelect paramKey="channel" options={channelOptions} ariaLabel="Channel" />
          <UrlSelect paramKey="fulfillment" options={fulfillmentOptions} ariaLabel="Fulfillment" />
          <UrlSelect paramKey="payment" options={paymentOptions} ariaLabel="Payment" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
            Date range
          </span>
          <UrlDateRange fromDefault={from} toDefault={to} />
        </div>
      </div>

      {orders.length === 0 ? (
        hasFilters ? (
          <EmptyState
            emoji="🔎"
            title="No matches"
            description="Try a different filter or clear all."
          />
        ) : (
          <EmptyState
            emoji="📦"
            title="No orders yet"
            description="Create your first order or sync from Wix."
            action={
              canCreate ? (
                <Link href="/dashboard/orders/new" className={buttonClasses()}>
                  <Plus className="w-4 h-4" />
                  New Order
                </Link>
              ) : null
            }
          />
        )
      ) : (
        <>
          <PagerPublisher entity="orders" segments={orders.map((o) => o.id)} />
          {canCreate ? <OrdersBulkPay orders={orders} accounts={payAccounts} /> : null}
          <DataTable
            columns={columns}
            rows={orders}
            rowKey={(r) => r.id}
            mobileCard={(r) => {
              const cans: string[] = [];
              if (r.pcl_qty > 0) cans.push(`PCL ${r.pcl_qty}`);
              if (r.acg_qty > 0) cans.push(`ACG ${r.acg_qty}`);
              if (r.wpm_qty > 0) cans.push(`WPM ${r.wpm_qty}`);
              const batches = batchesByOrder[r.id] ?? [];
              return (
                <Link
                  href={`/dashboard/orders/${r.id}`}
                  className="block bg-white border border-border rounded-lg shadow-card p-3 active:bg-cream/60 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs text-inkSoft">
                      {r.external_id ?? "—"}
                    </span>
                    <Badge tone={CHANNEL_TONE[r.channel]}>{r.channel}</Badge>
                  </div>
                  <div className="font-semibold text-ink truncate">
                    {r.partner?.name ?? r.customer_name ?? "Walk-in"}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs">
                    <span className="text-inkSoft">{formatDate(r.order_date)}</span>
                    <span className="font-serif font-bold text-base text-berry">
                      {formatPHP(r.total)}
                    </span>
                  </div>
                  {cans.length > 0 ? (
                    <div className="text-xs text-inkSoft font-mono mt-1">
                      {cans.join(" · ")}
                    </div>
                  ) : null}
                  {batches.length > 0 ? (
                    <div className="text-xs text-inkSoft font-mono mt-0.5">
                      Batches: {batches.join(", ")}
                    </div>
                  ) : null}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <StatusBadge status={r.payment_status} />
                    <StatusBadge status={r.fulfillment_status} />
                  </div>
                </Link>
              );
            }}
          />
          {totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalRows={totalCount}
              baseParams={baseParams}
            />
          ) : (
            <div className="text-xs text-inkSoft text-right">
              Showing {orders.length} of {totalCount}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalRows,
  baseParams,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  baseParams: URLSearchParams;
}) {
  function hrefForPage(target: number): string {
    const next = new URLSearchParams(baseParams.toString());
    next.set("page", String(target));
    const qs = next.toString();
    return `/dashboard/orders${qs ? `?${qs}` : ""}`;
  }
  return (
    <div className="flex items-center justify-between text-sm text-inkSoft">
      <div>
        Page {page} of {totalPages} · {totalRows} orders
      </div>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={hrefForPage(page - 1)}
            className="px-3 py-1.5 rounded-md text-ink border border-border hover:bg-cream"
          >
            ← Prev
          </Link>
        ) : (
          <span className="px-3 py-1.5 rounded-md text-inkSoft/50 border border-border">
            ← Prev
          </span>
        )}
        {page < totalPages ? (
          <Link
            href={hrefForPage(page + 1)}
            className="px-3 py-1.5 rounded-md text-ink border border-border hover:bg-cream"
          >
            Next →
          </Link>
        ) : (
          <span className="px-3 py-1.5 rounded-md text-inkSoft/50 border border-border">
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
