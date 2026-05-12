import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
};

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  function Label({ className, children, required, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn("block text-sm font-medium text-ink mb-1", className)}
        {...props}
      >
        {children}
        {required ? <span className="text-coral ml-0.5">*</span> : null}
      </label>
    );
  },
);
