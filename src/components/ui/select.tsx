import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-10 min-h-[44px] md:min-h-0 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink appearance-none",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 12 12%22><path fill=%22%235A5A6E%22 d=%22M2.5 4.5l3.5 3.5 3.5-3.5z%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center] pr-9",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/30 focus-visible:border-berry",
          "disabled:cursor-not-allowed disabled:bg-cream disabled:text-inkSoft",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
