import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "dangerGhost" | "berryGhost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-berry text-white font-semibold hover:bg-berry/90 focus-visible:ring-berry/40",
  ghost:
    "bg-white border border-border text-ink font-medium hover:bg-cream focus-visible:ring-border",
  dangerGhost:
    "bg-white border border-coral text-coral font-medium hover:bg-salmonBg focus-visible:ring-coral/40",
  berryGhost:
    "bg-white border border-berryLt text-berry font-medium hover:bg-berryBg focus-visible:ring-berry/30",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md transition touch-manipulation focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Returns the className string for a button-styled element. Use this when
 * you need to render a Link (or other element) that looks like a Button —
 * <button> inside <a> is invalid HTML, so this is the right pattern.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(BASE, SIZES[size], VARIANTS[variant], className);
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonClasses({ variant, size, className })}
        {...props}
      />
    );
  },
);
