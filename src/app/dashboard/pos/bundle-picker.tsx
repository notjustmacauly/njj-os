"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, formatPHP } from "@/lib/utils";
import { SKU_EMOJI } from "./pricing";
import type { PosBundleRef, SkuRef } from "./types";

type Mix = { PCL: number; ACG: number; WPM: number };
const ZERO: Mix = { PCL: 0, ACG: 0, WPM: 0 };

export function BundlePicker({
  open,
  bundle,
  skus,
  onClose,
  onConfirm,
}: {
  open: boolean;
  bundle: PosBundleRef | null;
  skus: SkuRef[];
  onClose: () => void;
  onConfirm: (mix: Mix) => void;
}) {
  const [mix, setMix] = React.useState<Mix>(ZERO);

  React.useEffect(() => {
    if (open) setMix(ZERO);
  }, [open]);

  const totalCans = bundle?.total_cans ?? 0;
  const bundlePrice = Number(bundle?.price ?? 0);
  const total = mix.PCL + mix.ACG + mix.WPM;
  const remaining = totalCans - total;
  const canSubmit = total === totalCans && totalCans > 0;

  function bump(code: keyof Mix, delta: number) {
    setMix((prev) => {
      const next = prev[code] + delta;
      if (next < 0) return prev;
      const newTotal = prev.PCL + prev.ACG + prev.WPM + delta;
      if (newTotal > totalCans) return prev;
      return { ...prev, [code]: next };
    });
  }

  function handleConfirm() {
    if (!canSubmit) return;
    onConfirm(mix);
    onClose();
  }

  return (
    <Modal
      open={open && bundle !== null}
      onClose={onClose}
      title={bundle?.name ?? "Bundle"}
      description={`Pick ${totalCans} can${totalCans === 1 ? "" : "s"} across PCL / ACG / WPM.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            Add bundle · {formatPHP(bundlePrice)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {(["PCL", "ACG", "WPM"] as const).map((code) => {
          const sku = skus.find((s) => s.code === code);
          const qty = mix[code];
          const atCap = total >= totalCans;
          return (
            <div
              key={code}
              className="flex items-center gap-3 p-3 border border-border rounded-lg"
            >
              <span aria-hidden className="text-2xl">{SKU_EMOJI[code]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink">{code}</div>
                <div className="text-xs text-inkSoft truncate">
                  {sku?.short_label ?? sku?.name ?? code}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => bump(code, -1)}
                  disabled={qty <= 0}
                  aria-label={`Decrease ${code}`}
                  className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-inkSoft hover:bg-cream disabled:opacity-40"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-mono">{qty}</span>
                <button
                  type="button"
                  onClick={() => bump(code, +1)}
                  disabled={atCap}
                  aria-label={`Increase ${code}`}
                  className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-inkSoft hover:bg-cream disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        <div
          className={cn(
            "flex items-center justify-between text-sm px-1 pt-1",
            canSubmit ? "text-emerald-700" : "text-inkSoft",
          )}
        >
          <span>
            {total} of {totalCans} selected
            {remaining > 0 ? ` · ${remaining} more` : null}
          </span>
          <span className="font-mono">{formatPHP(bundlePrice)}</span>
        </div>
      </div>
    </Modal>
  );
}
