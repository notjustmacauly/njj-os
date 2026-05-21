import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type = "text", ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-10 min-h-[44px] md:min-h-0 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink",
          "placeholder:text-inkSoft/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-berry/30 focus-visible:border-berry",
          "disabled:cursor-not-allowed disabled:bg-cream disabled:text-inkSoft",
          className,
        )}
        {...props}
      />
    );
  },
);
