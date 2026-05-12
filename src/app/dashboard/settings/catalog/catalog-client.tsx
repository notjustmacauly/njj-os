"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BundlesTab } from "./bundles-tab";
import { PosProductsTab } from "./pos-products-tab";
import { SkusTab } from "./skus-tab";
import { TicketTypesTab } from "./ticket-types-tab";
import type {
  PartnerTierRow,
  PosBundleRow,
  PosProductRow,
  SkuRow,
  TicketTypeRow,
} from "./types";

type TabKey = "skus" | "tickets" | "pos" | "bundles";

const TABS: { key: TabKey; label: string }[] = [
  { key: "skus", label: "SKUs" },
  { key: "tickets", label: "Ticket Types" },
  { key: "pos", label: "POS Products" },
  { key: "bundles", label: "Bundles" },
];

const SUB_NAV: { key: string; label: string; href: string; disabled?: boolean }[] = [
  { key: "catalog", label: "Catalog", href: "/dashboard/settings/catalog?tab=skus" },
  { key: "team", label: "Team", href: "#", disabled: true },
  { key: "accounts", label: "Accounts", href: "#", disabled: true },
];

function parseTab(v: string | null): TabKey {
  if (v === "tickets" || v === "pos" || v === "bundles") return v;
  return "skus";
}

export function CatalogClient({
  skus,
  ticketTypes,
  posProducts,
  bundles,
  tiers,
}: {
  skus: SkuRow[];
  ticketTypes: TicketTypeRow[];
  posProducts: PosProductRow[];
  bundles: PosBundleRow[];
  tiers: PartnerTierRow[];
}) {
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
          <SettingsIcon className="w-7 h-7 text-berry" />
          Settings
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          Configure the catalog, team, and ledger.
        </p>
      </header>

      {/* Sub-nav: Catalog / Team (coming soon) / Accounts (coming soon) */}
      <nav className="border-b border-border -mx-6 px-6 flex gap-1">
        {SUB_NAV.map((item) =>
          item.disabled ? (
            <span
              key={item.key}
              className="px-4 py-2 text-sm font-medium text-inkSoft/50 cursor-not-allowed border-b-2 border-transparent inline-flex items-center gap-1"
            >
              {item.label}
              <span className="text-[9px] uppercase tracking-smallcaps">soon</span>
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="px-4 py-2 text-sm font-semibold text-berry border-b-2 border-berry -mb-px"
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>

      {/* Inner tabs: SKUs / Ticket Types / POS Products */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/dashboard/settings/catalog?tab=${t.key}`}
              scroll={false}
              className={cn(
                "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition",
                active
                  ? "text-berry border-berry"
                  : "text-inkSoft border-transparent hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "skus" ? <SkusTab initialSkus={skus} initialTiers={tiers} /> : null}
      {tab === "tickets" ? <TicketTypesTab initial={ticketTypes} /> : null}
      {tab === "pos" ? <PosProductsTab initial={posProducts} /> : null}
      {tab === "bundles" ? <BundlesTab initial={bundles} /> : null}
    </div>
  );
}
