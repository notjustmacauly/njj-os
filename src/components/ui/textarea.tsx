import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "flex w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink",
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
