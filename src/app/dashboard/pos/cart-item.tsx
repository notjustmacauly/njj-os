"use client";

import * as React from "react";
import { Minus, Plus, X } from "lucide-react";
import { formatPHP } from "@/lib/utils";
import type { CartItem as CartItemModel } from "./types";

export function CartItem({
  item,
  onQtyChange,
  onRemove,
  disabled,
}: {
  item: CartItemModel;
  onQtyChange: (next: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState<string>(String(item.qty));

  // Keep local draft in sync when parent qty changes (e.g. ±1 buttons, bundle add).
  React.useEffect(() => {
    setDraft(String(item.qty));
  }, [item.qty]);

  function handleChange(ev: React.ChangeEvent<HTMLInputElement>) {
    // Strip non-digit characters; allow empty while editing.
    const cleaned = ev.target.value.replace(/[^\d]/g, "");
    setDraft(cleaned);
    if (cleaned === "") return; // wait for blur to decide
    const n = parseInt(cleaned, 10);
    if (Number.isFinite(n) && n >= 1) onQtyChange(n);
  }

  function handleBlur() {
    if (draft === "" || parseInt(draft, 10) < 1 || !Number.isFinite(parseInt(draft, 10))) {
      setDraft("1");
      if (item.qty !== 1) onQtyChange(1);
    }
  }

  function handleFocus(ev: React.FocusEvent<HTMLInputElement>) {
    ev.target.select();
  }

  const lineTotal = item.qty * item.unit_price;

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.emoji ? (
            <span aria-hidden className="text-base leading-none">
              {item.emoji}
            </span>
          ) : null}
          <span className="font-semibold text-sm text-ink truncate">
            {item.label}
          </span>
        </div>
        <div className="text-xs text-inkSoft font-mono">
          {formatPHP(item.unit_price)} · {formatPHP(lineTotal)}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onQtyChange(Math.max(1, item.qty - 1))}
          disabled={disabled || item.qty <= 1}
          aria-label="Decrease quantity by 1"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-inkSoft hover:bg-cream disabled:opacity-40"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          aria-label="Quantity"
          className="w-12 h-7 text-center font-mono text-sm rounded-md border border-border bg-white text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/30 focus-visible:border-berry disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={() => onQtyChange(item.qty + 1)}
          disabled={disabled}
          aria-label="Increase quantity by 1"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-inkSoft hover:bg-cream disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove item"
        className="ml-1 p-1 rounded-md text-inkSoft hover:bg-salmonBg hover:text-coral disabled:opacity-40"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
