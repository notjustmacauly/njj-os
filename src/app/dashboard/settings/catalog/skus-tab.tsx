"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { useToast } from "@/components/ui/toast";
import { SKU_EMOJI } from "../../pos/pricing";
import type { PartnerTierRow, SkuRow } from "./types";

type SkuDraft = { name: string; retail_price: string };
type TierDraft = { price_pcl: string; price_acg: string; price_wpm: string };

export function SkusTab({
  initialSkus,
  initialTiers,
  canEdit,
}: {
  initialSkus: SkuRow[];
  initialTiers: PartnerTierRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [skuDrafts, setSkuDrafts] = React.useState<Record<string, SkuDraft>>(() => {
    const m: Record<string, SkuDraft> = {};
    for (const s of initialSkus) {
      m[s.code] = { name: s.name, retail_price: String(Number(s.retail_price ?? 0)) };
    }
    return m;
  });
  const [tierDrafts, setTierDrafts] = React.useState<Record<string, TierDraft>>(() => {
    const m: Record<string, TierDraft> = {};
    for (const t of initialTiers) {
      m[t.code] = {
        price_pcl: String(Number(t.price_pcl ?? 0)),
        price_acg: String(Number(t.price_acg ?? 0)),
        price_wpm: String(Number(t.price_wpm ?? 0)),
      };
    }
    return m;
  });
  const [submitting, setSubmitting] = React.useState(false);

  const changedSkus = initialSkus.filter((s) => {
    const d = skuDrafts[s.code];
    if (!d) return false;
    const nameChanged = d.name !== s.name;
    const priceChanged = Number(d.retail_price) !== Number(s.retail_price ?? 0);
    return nameChanged || priceChanged;
  });

  const changedTiers = initialTiers.filter((t) => {
    const d = tierDrafts[t.code];
    if (!d) return false;
    return (
      Number(d.price_pcl) !== Number(t.price_pcl ?? 0) ||
      Number(d.price_acg) !== Number(t.price_acg ?? 0) ||
      Number(d.price_wpm) !== Number(t.price_wpm ?? 0)
    );
  });

  const totalChanges = changedSkus.length + changedTiers.length;

  function setSkuField(code: string, key: keyof SkuDraft, value: string) {
    setSkuDrafts((prev) => ({ ...prev, [code]: { ...prev[code], [key]: value } }));
  }
  function setTierField(code: string, key: keyof TierDraft, value: string) {
    setTierDrafts((prev) => ({ ...prev, [code]: { ...prev[code], [key]: value } }));
  }

  async function handleSave() {
    if (submitting) return;
    if (totalChanges === 0) {
      toast.push("No changes to save.", "info");
      return;
    }

    for (const s of changedSkus) {
      const d = skuDrafts[s.code];
      if (!d.name.trim()) return toast.push(`${s.code}: name required`, "error");
      const n = Number(d.retail_price);
      if (!Number.isFinite(n) || n < 0)
        return toast.push(`${s.code}: retail price must be ≥ 0`, "error");
    }
    for (const t of changedTiers) {
      const d = tierDrafts[t.code];
      for (const k of ["price_pcl", "price_acg", "price_wpm"] as const) {
        const n = Number(d[k]);
        if (!Number.isFinite(n) || n < 0)
          return toast.push(`Tier ${t.code}: ${k} must be ≥ 0`, "error");
      }
    }

    setSubmitting(true);
    const supabase = createClient();

    const skuOps = changedSkus.map((s) =>
      supabase
        .from("skus")
        .update({
          name: skuDrafts[s.code].name.trim(),
          retail_price: Number(skuDrafts[s.code].retail_price),
        })
        .eq("code", s.code),
    );
    const tierOps = changedTiers.map((t) =>
      supabase
        .from("partner_tiers")
        .update({
          price_pcl: Number(tierDrafts[t.code].price_pcl),
          price_acg: Number(tierDrafts[t.code].price_acg),
          price_wpm: Number(tierDrafts[t.code].price_wpm),
        })
        .eq("code", t.code),
    );

    const results = await Promise.all([...skuOps, ...tierOps]);
    setSubmitting(false);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) {
      toast.push(firstErr.message, "error");
      return;
    }
    toast.push(`Saved ${totalChanges} change${totalChanges === 1 ? "" : "s"}`, "success");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-serif font-bold text-lg text-ink">Juice SKUs</h2>
          <p className="text-sm text-inkSoft mt-1">
            Name + retail price for each SKU. Retail is the fallback for non-B2B orders.
          </p>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-cream text-inkSoft">
            <tr className="text-left">
              <th className="px-5 py-2 font-semibold w-20">Code</th>
              <th className="px-5 py-2 font-semibold">Name</th>
              <th className="px-5 py-2 font-semibold w-24">Size</th>
              <th className="px-5 py-2 font-semibold w-40 text-right">Retail price</th>
            </tr>
          </thead>
          <tbody>
            {initialSkus.map((s) => (
              <tr key={s.code} className="border-t border-border">
                <td className="px-5 py-3">
                  <span className="font-mono font-semibold text-ink inline-flex items-center gap-1.5">
                    <span aria-hidden>{SKU_EMOJI[s.code] ?? ""}</span>
                    {s.code}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {canEdit ? (
                    <Input
                      value={skuDrafts[s.code]?.name ?? ""}
                      onChange={(e) => setSkuField(s.code, "name", e.target.value)}
                      disabled={submitting}
                      aria-label={`Name for ${s.code}`}
                    />
                  ) : (
                    <span className="text-ink">{s.name}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-inkSoft font-mono text-xs">
                  {s.size_ml} mL
                </td>
                <td className="px-5 py-3 text-right">
                  {canEdit ? (
                    <div className="inline-block w-32">
                      <NumberInput
                        prefix="₱"
                        min="0"
                        step="1"
                        value={skuDrafts[s.code]?.retail_price ?? ""}
                        onChange={(e) => setSkuField(s.code, "retail_price", e.target.value)}
                        disabled={submitting}
                        className="text-right"
                        aria-label={`Retail price for ${s.code}`}
                      />
                    </div>
                  ) : (
                    <span className="font-mono">₱{Number(s.retail_price ?? 0).toFixed(2)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-serif font-bold text-lg text-ink">Partner tier prices</h2>
          <p className="text-sm text-inkSoft mt-1">
            Wholesale prices used as defaults for B2B orders. Per-partner overrides
            on the partner record take precedence.
          </p>
        </div>

        {initialTiers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-inkSoft text-center">No active tiers.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream text-inkSoft">
              <tr className="text-left">
                <th className="px-5 py-2 font-semibold w-24">Tier</th>
                <th className="px-5 py-2 font-semibold">Name</th>
                <th className="px-5 py-2 font-semibold w-32 text-right">PCL</th>
                <th className="px-5 py-2 font-semibold w-32 text-right">ACG</th>
                <th className="px-5 py-2 font-semibold w-32 text-right">WPM</th>
              </tr>
            </thead>
            <tbody>
              {initialTiers.map((t) => (
                <tr key={t.code} className="border-t border-border">
                  <td className="px-5 py-3 font-mono font-semibold text-ink">{t.code}</td>
                  <td className="px-5 py-3 text-ink">{t.name}</td>
                  {(["price_pcl", "price_acg", "price_wpm"] as const).map((k) => (
                    <td key={k} className="px-5 py-3 text-right">
                      {canEdit ? (
                        <div className="inline-block w-28">
                          <NumberInput
                            prefix="₱"
                            min="0"
                            step="1"
                            value={tierDrafts[t.code]?.[k] ?? ""}
                            onChange={(e) => setTierField(t.code, k, e.target.value)}
                            disabled={submitting}
                            className="text-right"
                            aria-label={`Tier ${t.code} ${k}`}
                          />
                        </div>
                      ) : (
                        <span className="font-mono">
                          ₱{Number(t[k] ?? 0).toFixed(2)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canEdit ? (
        <div className="bg-white border border-border rounded-lg shadow-card px-5 py-4 flex items-center justify-between sticky bottom-0">
          <p className="text-xs text-inkSoft">
            {totalChanges === 0
              ? "No pending changes."
              : `${totalChanges} pending change${totalChanges === 1 ? "" : "s"} across SKUs + tiers.`}
          </p>
          <Button onClick={handleSave} disabled={submitting || totalChanges === 0}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-inkSoft px-1">
          View-only. Only owner and partner roles can edit catalog prices.
        </p>
      )}
    </div>
  );
}
