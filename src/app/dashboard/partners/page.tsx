import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPHP } from "@/lib/utils";
import { Badge, tierTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { UrlCheckbox, UrlSearch, UrlSelect } from "@/components/ui/url-filters";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";

type PartnerRow = {
  id: string;
  external_id: string | null;
  name: string;
  city: string | null;
  tier_code: string;
  delivery_fee: number | string | null;
  contact: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
};

function asString(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function PartnersListPage({
  searchParams,
}: {
  searchParams?: { q?: string; tier?: string; active?: string };
}) {
  const supabase = await createClient();

  const q = asString(searchParams?.q).trim();
  const tier = asString(searchParams?.tier).trim();
  const activeOnly = asString(searchParams?.active) === "1";

  // Role for UI gating (RLS does the real auth)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: roleRow } = user
    ? await supabase.from("user_roles").select("role").eq("user_id", user.id).single()
    : { data: null };
  const role = roleRow?.role as import("@/lib/roles").Role | null;
  // Per access matrix: owner/partner/manager can create partners.
  const canCreate = role === "owner" || role === "partner" || role === "manager";

  // Tiers for the filter select + KPI labels
  const { data: tiersData } = await supabase
    .from("partner_tiers")
    .select("code, name")
    .eq("is_active", true)
    .order("code");
  const tiers = tiersData ?? [];

  // KPI data — unfiltered active partners
  const { data: kpiRows } = await supabase
    .from("partners")
    .select("tier_code")
    .is("deleted_at", null)
    .eq("is_active", true);
  const totalActive = (kpiRows ?? []).length;
  const byTier: Record<string, number> = {};
  for (const r of kpiRows ?? []) {
    byTier[r.tier_code] = (byTier[r.tier_code] ?? 0) + 1;
  }
  const tierAB = (byTier["A"] ?? 0) + (byTier["B"] ?? 0);
  const tierCD = (byTier["C"] ?? 0) + (byTier["D"] ?? 0);

  // Filtered list
  let query = supabase
    .from("partners")
    .select(
      "id, external_id, name, city, tier_code, delivery_fee, contact, email, is_active, created_at",
    )
    .is("deleted_at", null);
  if (q) query = query.ilike("name", `%${q}%`);
  if (tier) query = query.eq("tier_code", tier);
  if (activeOnly) query = query.eq("is_active", true);

  const { data: partnersData } = await query.order("name", { ascending: true });
  const partners = (partnersData ?? []) as PartnerRow[];
  const hasFilters = !!(q || tier || activeOnly);

  const columns: Column<PartnerRow>[] = [
    {
      key: "external_id",
      header: "ID",
      className: "w-28",
      render: (r) => (
        <span className="text-xs font-mono text-inkSoft">{r.external_id ?? "—"}</span>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <Link
          href={`/dashboard/partners/${r.id}`}
          className="font-semibold text-ink hover:text-berry"
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: "city",
      header: "City",
      render: (r) => <span className="text-inkSoft">{r.city ?? "—"}</span>,
    },
    {
      key: "tier_code",
      header: "Tier",
      className: "w-20",
      render: (r) => <Badge tone={tierTone(r.tier_code)}>{r.tier_code}</Badge>,
    },
    {
      key: "delivery_fee",
      header: "Delivery",
      className: "w-24 text-right",
      render: (r) => (
        <span className="font-semibold text-berry">{formatPHP(r.delivery_fee)}</span>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (r) => (
        <span className="text-inkSoft text-xs">{r.contact || r.email || "—"}</span>
      ),
    },
    {
      key: "created_at",
      header: "Added",
      className: "w-28",
      render: (r) => (
        <span className="text-xs text-inkSoft">{formatDate(r.created_at)}</span>
      ),
    },
  ];

  const tierOptions = [
    { value: "", label: "All tiers" },
    ...tiers.map((t) => ({ value: t.code, label: t.name })),
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-ink">
            <span aria-hidden className="mr-2">📋</span>
            Partners
          </h1>
          <p className="text-sm text-inkSoft mt-1">
            Manage B2B customers and their pricing tiers.
          </p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/partners/new" className={buttonClasses()}>
            <Plus className="w-4 h-4" />
            New Partner
          </Link>
        ) : null}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Active partners"
          value={totalActive}
          accent="peri"
          sub="across all tiers"
        />
        <KpiCard
          label="Tier A + B"
          value={tierAB}
          accent="berry"
          sub="premium tiers"
        />
        <KpiCard
          label="Tier C + D"
          value={tierCD}
          accent="yellow"
          sub="standard tiers"
        />
        <KpiCard
          label="Tiers configured"
          value={tiers.length}
          accent="peri"
          sub="from partner_tiers"
        />
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card p-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <UrlSearch placeholder="Search by name…" />
        </div>
        <div className="w-44">
          <UrlSelect paramKey="tier" options={tierOptions} ariaLabel="Filter by tier" />
        </div>
        <UrlCheckbox paramKey="active" label="Active only" />
      </div>

      {partners.length === 0 ? (
        hasFilters ? (
          <EmptyState
            emoji="🔎"
            title="No matches"
            description="Try a different search or clear the filters."
          />
        ) : (
          <EmptyState
            emoji="📋"
            title="No partners yet"
            description="Add your first B2B partner to get started."
            action={
              canCreate ? (
                <Link href="/dashboard/partners/new" className={buttonClasses()}>
                  <Plus className="w-4 h-4" />
                  New Partner
                </Link>
              ) : null
            }
          />
        )
      ) : (
        <DataTable columns={columns} rows={partners} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
