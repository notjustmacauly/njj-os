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

function parseTab(v: string | null): TabKey {
  if (v === "tickets" || v === "pos" || v === "bundles") return v;
  return "skus";
}

export function CatalogClient({
  canEdit,
  skus,
  ticketTypes,
  posProducts,
  bundles,
  tiers,
}: {
  canEdit: boolean;
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
          Catalog
        </h1>
        <p className="text-sm text-inkSoft mt-1">
          SKUs, ticket types, POS products and bundles.
        </p>
      </header>

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

      {tab === "skus" ? (
        <SkusTab initialSkus={skus} initialTiers={tiers} canEdit={canEdit} />
      ) : null}
      {tab === "tickets" ? (
        <TicketTypesTab initial={ticketTypes} canEdit={canEdit} />
      ) : null}
      {tab === "pos" ? (
        <PosProductsTab initial={posProducts} canEdit={canEdit} />
      ) : null}
      {tab === "bundles" ? (
        <BundlesTab initial={bundles} canEdit={canEdit} />
      ) : null}
    </div>
  );
}
