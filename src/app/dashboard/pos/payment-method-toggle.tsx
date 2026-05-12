"use client";

import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type PaymentMethod } from "./pricing";

export function PaymentMethodToggle({
  value,
  onChange,
  disabled,
}: {
  value: PaymentMethod | null;
  onChange: (next: PaymentMethod) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment method">
      {PAYMENT_METHODS.map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={cn(
              "px-2 py-2 rounded-md text-xs font-semibold transition border",
              active
                ? "bg-berry text-white border-berry shadow-sm"
                : "bg-white text-ink border-border hover:bg-cream",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}
