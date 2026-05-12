import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPHP } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InventoryBadge } from "@/components/ui/inventory-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  UrlCheckbox,
  UrlSearch,
  UrlSelect,
} from "@/components/ui/url-filters";
import { MonthInput } from "./month-input";

type SkuTone = "berry" | "peri" | "coral" | "yellow" | "default";
const SKU_TONE: Record<string, SkuTone> = {
  PCL: "berry",
  ACG: "peri",
  WPM: "coral",
};

const SKU_EMOJI: Record<string, string> = {
  PCL: "🍍",
  ACG: "🥕",
  WPM: "🍉",
};

type BatchRow = {
  id: string;
  external_id: string | null;
  batch_date: string;
  sku_code: string;
  units_planned: number;
  units_produced: number;
  wastage: number;
  ph: number | string | null;
  brix: number | string | null;
  qc_passed: boolean | null;
  cogs_total: number | string;
  staff_name: string | null;
};

type InvRow = {
  batch_id: string;
  remaining: number;
  remaining_signed: number;
  sku_code: string;
  units_produced: number;
};

function asString(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthIso: string): { start: string; end: string; label: string } {
  // monthIso is "YYYY-MM"; produce the first day of that month and first day of the NEXT month.
  const [y, m] = monthIso.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return monthRange(currentMonthIso());
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  const label = start.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return { start: startIso, end: endIso, label };
}

export default async function ProductionListPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    sku?: string;
    qc?: string;
    month?: string;
    oversold?: string;
  };
}) {
  const supabase = await createClient();

  const q = asString(searchParams?.q).trim();
  const sku = asString(searchParams?.sku).trim();
  const qc = asString(searchParams?.qc).trim();
  const monthIso = asString(searchParams?.month).trim() || currentMonthIso();
  const oversold = asString(searchParams?.oversold) === "1";
  const { start, end, label: monthLabel } = monthRange(monthIso);

  // Role gating
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roleRow } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id).single()
    : { data: null };
  const role = roleRow?.role as "admin" | "manager" | "ops" | "staff" | null;
  const canCreate = role === "admin" || role === "manager" || role === "ops";

  // KPI: month batches (count + units_produced sum + wastage sum + units_planned sum for %)
  const { data: monthBatches } = await supabase
    .from("batches")
    .select("units_planned, units_produced, wastage")
    .is("deleted_at", null)
    .gte("batch_date", start)
    .lt("batch_date", end);

  const monthRows = monthBatches ?? [];
  const batchesThisMonth = monthRows.length;
  const cansThisMonth = monthRows.reduce((s, r) => s + Number(r.units_produced ?? 0), 0);
  const wastageThisMonth = monthRows.reduce((s, r) => s + Number(r.wastage ?? 0), 0);
  const plannedThisMonth = monthRows.reduce((s, r) => s + Number(r.units_planned ?? 0), 0);
  const wastagePct =
    plannedThisMonth > 0
      ? Math.round((wastageThisMonth / plannedThisMonth) * 100)
      : 0;

  // KPI: total stock on hand (across all batches)
  const { data: allInv } = await supabase
    .from("inventory_summary")
    .select("sku_code, remaining");
  const totalStock = (allInv ?? []).reduce(
    (s, r) => s + Math.max(0, Number(r.remaining ?? 0)),
    0,
  );
  const stockBySku: Record<string, number> = { PCL: 0, ACG: 0, WPM: 0 };
  for (const r of allInv ?? []) {
    const code = r.sku_code as string;
    if (!(code in stockBySku)) stockBySku[code] = 0;
    stockBySku[code] += Math.max(0, Number(r.remaining ?? 0));
  }

  // List query — apply filters
  let listQuery = supabase
    .from("batches")
    .select(
      "id, external_id, batch_date, sku_code, units_planned, units_produced, wastage, ph, brix, qc_passed, cogs_total, staff_name",
    )
    .is("deleted_at", null)
    .gte("batch_date", start)
    .lt("batch_date", end)
    .order("batch_date", { ascending: false })
    .order("external_id", { ascending: false });

  if (sku) listQuery = listQuery.eq("sku_code", sku);
  if (qc === "passed") listQuery = listQuery.eq("qc_passed", true);
  if (qc === "failed") listQuery = listQuery.eq("qc_passed", false);
  if (qc === "notyet") listQuery = listQuery.is("qc_passed", null);
  if (q) {
    listQuery = listQuery.or(
      `external_id.ilike.%${q}%,staff_name.ilike.%${q}%`,
    );
  }

  const { data: batchesData } = await listQuery;
  let batches = (batchesData ?? []) as BatchRow[];

  // Inventory data for filtered batches — used for Remaining + oversold filter
  const invMap: Record<string, InvRow> = {};
  if (batches.length > 0) {
    const { data: invData } = await supabase
      .from("inventory_summary")
      .select("batch_id, remaining, remaining_signed, sku_code, units_produced")
      .in(
        "batch_id",
        batches.map((b) => b.id),
      );
    for (const r of (invData ?? []) as InvRow[]) {
      invMap[r.batch_id] = r;
    }
  }

  if (oversold) {
    batches = batches.filter((b) => {
      const inv = invMap[b.id];
      return inv && inv.remaining_signed < 0;
    });
  }

  const hasFilters = !!(q || sku || qc || oversold);

  const skuOptions = [
    { value: "", label: "All SKUs" },
    { value: "PCL", label: "PCL — Pineapple Coconut Lime" },
    { value: "ACG", label: "ACG — Apple Carrot Ginger" },
    { value: "WPM", label: "WPM — Watermelon Passionfruit Mint" },
  ];
  const qcOptions = [
    { value: "", label: "Any QC" },
    { value: "passed", label: "QC Passed" },
    { value: "failed", label: "QC Failed" },
    { value: "notyet", label: "Not yet checked" },
  ];

  const columns: Column<BatchRow>[] = [
    {
      key: "external_id",
      header: "Batch ID",
      className: "w-32",
      render: (r) => (
        <Link
          href={`/dashboard/production/${r.id}`}
          className="font-mono text-xs text-ink hover:text-berry"
        >
          {r.external_id ?? "—"}
        </Link>
      ),
    },
    {
      key: "batch_date",
      header: "Date",
      className: "w-28",
      render: (r) => (
        <span className="text-xs text-inkSoft">{formatDate(r.batch_date)}</span>
      ),
    },
    {
      key: "sku_code",
      header: "SKU",
      className: "w-20",
      render: (r) => (
        <Badge tone={SKU_TONE[r.sku_code] ?? "default"}>
          {r.sku_code}
        </Badge>
      ),
    },
    {
      key: "units_planned",
      header: "Planned",
      className: "w-20 text-right font-mono text-xs",
      render: (r) => r.units_planned,
    },
    {
      key: "units_produced",
      header: "Produced",
      className: "w-20 text-right",
      render: (r) => (
        <span className="font-semibold text-berry font-mono">{r.units_produced}</span>
      ),
    },
    {
      key: "wastage",
      header: "Wastage",
      className: "w-20 text-right font-mono text-xs",
      render: (r) => {
        const overThreshold =
          r.units_planned > 0 && r.wastage > r.units_planned * 0.05;
        return (
          <span className={overThreshold ? "text-coral font-semibold" : ""}>
            {r.wastage}
          </span>
        );
      },
    },
    {
      key: "remaining",
      header: "Remaining",
      className: "w-24",
      render: (r) => {
        const inv = invMap[r.id];
        if (!inv) return <span className="text-inkSoft text-xs">—</span>;
        return (
          <InventoryBadge
            remaining={inv.remaining_signed}
            produced={inv.units_produced}
          />
        );
      },
    },
    {
      key: "ph",
      header: "pH",
      className: "w-14 text-right font-mono text-xs",
      render: (r) => r.ph != null ? Number(r.ph) : <span className="text-inkSoft">—</span>,
    },
    {
      key: "brix",
      header: "Brix",
      className: "w-14 text-right font-mono text-xs",
      render: (r) => r.brix != null ? Number(r.brix) : <span className="text-inkSoft">—</span>,
    },
    {
      key: "qc",
      header: "QC",
      className: "w-12 text-center",
      render: (r) =>
        r.qc_passed === true ? (
          <span className="text-green font-bold" title="Passed">✓</span>
        ) : r.qc_passed === false ? (
          <span className="text-coral font-bold" title="Failed">✕</span>
        ) : (
          <span className="text-inkSoft" title="Not yet checked">—</span>
        ),
    },
    {
      key: "cogs",
      header: "COGS",
      className: "w-24 text-right",
      render: (r) => (
        <span className="font-semibold text-berry">{formatPHP(r.cogs_total)}</span>
      ),
    },
    {
      key: "staff",
      header: "Staff",
      render: (r) => (
        <span className="text-xs text-inkSoft">{r.staff_name ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">🏭</span>
            Production
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Batches, ingredients, and live inventory.
          </p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/production/new" className={buttonClasses()}>
            <Plus className="w-4 h-4" />
            New Batch
          </Link>
        ) : null}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Batches this month"
          value={batchesThisMonth}
          accent="peri"
          sub={monthLabel}
        />
        <KpiCard
          label="Cans produced"
          value={cansThisMonth}
          accent="berry"
          sub="across all SKUs"
        />
        <KpiCard
          label="Total stock on hand"
          value={totalStock}
          accent="peri"
          sub="live inventory"
        />
        <KpiCard
          label="Wastage this month"
          value={wastageThisMonth}
          accent="coral"
          sub={`${wastagePct}% of planned`}
        />
      </div>

      {/* Inventory by SKU */}
      <div className="bg-salmonBg border border-salmon/40 rounded-lg px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["PCL", "ACG", "WPM"] as const).map((code) => (
          <Link
            key={code}
            href={{ pathname: "/dashboard/production", query: { sku: code } }}
            className="bg-white border border-border rounded-lg shadow-card px-4 py-3 hover:border-berryLt transition flex items-center justify-between"
          >
            <div>
              <div className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
                <span aria-hidden className="mr-1">{SKU_EMOJI[code]}</span>
                {code}
              </div>
              <div className="text-xs text-inkSoft mt-0.5">cans remaining</div>
            </div>
            <div className="font-serif font-bold text-3xl text-ink">
              {stockBySku[code] ?? 0}
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card p-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <UrlSearch placeholder="Search ID or staff…" />
        </div>
        <UrlSelect paramKey="sku" options={skuOptions} ariaLabel="SKU" />
        <UrlSelect paramKey="qc" options={qcOptions} ariaLabel="QC" />
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-smallcaps font-semibold text-inkSoft">
            Month
          </label>
          <MonthInput defaultIso={monthIso} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <UrlCheckbox paramKey="oversold" label="Show oversold only" />
        {hasFilters || monthIso !== currentMonthIso() ? (
          <Link
            href="/dashboard/production"
            className="text-xs text-berry hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>

      {batches.length === 0 ? (
        hasFilters ? (
          <EmptyState
            emoji="🔎"
            title="No matches"
            description="Try a different filter or pick a different month."
          />
        ) : (
          <EmptyState
            emoji="🏭"
            title="No batches yet"
            description="Log your first production run to start tracking inventory."
            action={
              canCreate ? (
                <Link href="/dashboard/production/new" className={buttonClasses()}>
                  <Plus className="w-4 h-4" />
                  New Batch
                </Link>
              ) : null
            }
          />
        )
      ) : (
        <DataTable columns={columns} rows={batches} rowKey={(r) => r.id} />
      )}
    </div>
  );
}

