import Link from "next/link";
import { FileText, Package, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/ui/kpi-card";
import { formatPHP } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string;
  subtitle: string | null;
  price: number | string;
  is_published: boolean;
};

export default async function WebsiteOverviewPage() {
  const supabase = await createClient();
  const [{ data: products }, { data: catalog }, { data: checkouts }] = await Promise.all([
    supabase
      .from("web_products")
      .select("id, name, subtitle, price, is_published")
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("web_catalog").select("id, packs_available"),
    supabase.from("web_checkouts").select("total, payment_verification, created_at").neq("payment_verification", "rejected"),
  ]);
  const sales = (checkouts ?? []) as Array<{ total: number | string; payment_verification: string; created_at: string }>;
  const toVerify = sales.filter((s) => s.payment_verification === "unverified");
  const monthStart = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 8) + "01T00:00:00+08:00");
  const monthSales = sales.filter((s) => new Date(s.created_at) >= monthStart).reduce((a, s) => a + Number(s.total), 0);

  const rows = (products ?? []) as ProductRow[];
  const stock = new Map(
    ((catalog ?? []) as Array<{ id: string; packs_available: number }>).map((c) => [c.id, c.packs_available]),
  );
  const published = rows.filter((r) => r.is_published);
  const soldOut = published.filter((r) => (stock.get(r.id) ?? 0) <= 0);
  const low = published.filter((r) => {
    const n = stock.get(r.id) ?? 0;
    return n > 0 && n <= 5;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/dashboard/website/orders">
          <KpiCard
            label="To verify"
            value={toVerify.length}
            sub={toVerify.length ? `${formatPHP(toVerify.reduce((a, s) => a + Number(s.total), 0))} unchecked` : "All payments checked"}
            accent="coral"
          />
        </Link>
        <KpiCard label="Sales this month" value={formatPHP(monthSales)} sub="Website orders" accent="berry" />
        <KpiCard label="Live products" value={published.length} sub={`${rows.length - published.length} hidden`} accent="peri" />
        <KpiCard label="Sold out / low" value={`${soldOut.length} / ${low.length}`} sub="Live packs" accent="yellow" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <section className="bg-white border border-border rounded-lg shadow-card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="font-semibold text-ink flex items-center gap-2">
              <Package className="w-4 h-4 text-berry" />
              Shop products
            </h2>
            <Link href="/dashboard/website/products" className="text-sm font-semibold text-berry hover:underline">
              Manage
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-inkSoft text-center">No products yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const n = stock.get(r.id);
                return (
                  <li key={r.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-ink truncate">{r.name}</div>
                      {r.subtitle ? <div className="text-xs text-inkSoft">{r.subtitle}</div> : null}
                    </div>
                    <div className="text-ink tabular-nums">{formatPHP(r.price)}</div>
                    <div className="w-28 text-right text-xs">
                      {!r.is_published ? (
                        <span className="text-inkSoft">Hidden</span>
                      ) : (n ?? 0) <= 0 ? (
                        <span className="text-coral font-semibold">Sold out</span>
                      ) : (
                        <span className="text-emerald-700">{n} packs left</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="bg-white border border-border rounded-lg shadow-card p-5 space-y-4">
          <h2 className="font-semibold text-ink">Coming to this dashboard</h2>
          <Upcoming
            icon={Trophy}
            title="Members"
            body="Member accounts, monthly memberships, points, leaderboard, seasons and challenges."
          />
          <Upcoming
            icon={FileText}
            title="Content"
            body="Homepage hero, Markets dates, contact info and photos — edited here, no code."
          />
        </section>
      </div>
    </div>
  );
}

function Upcoming({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-md bg-berryBg text-berry flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="text-xs text-inkSoft mt-0.5">{body}</p>
      </div>
    </div>
  );
}
