"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { SKU_EMOJI } from "./pricing";
import type { SkuRef } from "./types";

const FLAVORS = ["PCL", "ACG", "WPM"] as const;

export function CupFlavorPicker({
  open,
  cupName,
  skus,
  onClose,
  onPick,
}: {
  open: boolean;
  /** Product label (e.g. "Cup Small") used in the modal title. */
  cupName: string;
  skus: SkuRef[];
  onClose: () => void;
  onPick: (flavor: "PCL" | "ACG" | "WPM") => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pick flavor for ${cupName}`}
      description="One flavor per cup — tap to add."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {FLAVORS.map((code) => {
          const sku = skus.find((s) => s.code === code);
          return (
            <button
              key={code}
              type="button"
              onClick={() => {
                onPick(code);
                onClose();
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border px-3 py-5 min-h-[120px] text-center transition shadow-sm active:scale-[0.98]",
                "bg-white border-border hover:bg-cream",
              )}
            >
              <span aria-hidden className="text-4xl leading-none">
                {SKU_EMOJI[code]}
              </span>
              <span className="font-bold text-base text-ink">{code}</span>
              {sku?.short_label ? (
                <span className="text-[10px] uppercase tracking-smallcaps text-inkSoft">
                  {sku.short_label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
