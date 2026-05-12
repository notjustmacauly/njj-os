import * as React from "react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./input";

export type NumberInputProps = Omit<InputProps, "type"> & {
  prefix?: string;
};

/**
 * Number input with optional prefix (e.g. "₱"). Renders the prefix as a
 * non-interactive overlay; the input itself stays a real number input so
 * mobile keyboards behave correctly.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ prefix, className, ...props }, ref) {
    if (!prefix) {
      return <Input ref={ref} type="number" inputMode="decimal" className={className} {...props} />;
    }
    return (
      <div className="relative">
        <span
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-inkSoft pointer-events-none"
        >
          {prefix}
        </span>
        <Input
          ref={ref}
          type="number"
          inputMode="decimal"
          className={cn("pl-7", className)}
          {...props}
        />
      </div>
    );
  },
);
