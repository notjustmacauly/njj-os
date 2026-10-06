import Link from "next/link";
import { ArrowUpRightLine } from "./icons";
import { cn } from "@/lib/utils";

// Storefront primitives. One accent (logo salmon), neutral everything else.
// Shape rule: buttons/chips pill, cards 28px inside 32px bezel shells, inputs 14px.

type BtnProps = {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "quiet";
  arrow?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  external?: boolean;
};

const btnBase =
  "group inline-flex items-center justify-center gap-3 rounded-full font-semibold whitespace-nowrap transition duration-300 ease-settle active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-s-fg/40 focus-visible:ring-offset-2 focus-visible:ring-offset-s-canvas";

/** Pill button. Primary = inverted ink pill with a nested arrow chip. */
export function Btn({ href, onClick, children, variant = "primary", arrow, disabled, type = "button", className, external }: BtnProps) {
  const cls = cn(
    btnBase,
    variant === "primary"
      ? cn("bg-s-invert text-s-invert-fg hover:bg-s-invert/90", arrow ? "pl-6 pr-1.5 py-1.5" : "px-7 py-3.5")
      : "px-5 py-3 text-s-fg hover:bg-s-line/[0.06]",
    disabled && "opacity-40 pointer-events-none",
    className,
  );
  const inner = (
    <>
      <span>{children}</span>
      {arrow ? (
        <span className="w-10 h-10 rounded-full bg-s-invert-fg/10 flex items-center justify-center transition duration-300 ease-settle group-hover:translate-x-0.5 group-hover:-translate-y-px">
          <ArrowUpRightLine className="w-4 h-4" />
        </span>
      ) : null}
    </>
  );
  if (href) {
    return external ? (
      <a href={href} className={cls}>
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** Double-bezel: a quiet outer tray holding the real surface. */
export function Bezel({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div className={cn("rounded-[32px] bg-s-sunken/70 p-1.5 ring-1 ring-s-line/[0.06]", className)}>
      <div
        className={cn(
          "relative rounded-[26px] overflow-hidden bg-s-surface shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("max-w-[1320px] mx-auto px-5 sm:px-8", className)}>{children}</div>;
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-display font-semibold tracking-[-0.03em] leading-[1.02] text-4xl md:text-5xl text-s-fg [text-wrap:balance]", className)}>
      {children}
    </h2>
  );
}

export function Lede({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-lg text-s-muted leading-relaxed max-w-[52ch] [text-wrap:pretty]", className)}>{children}</p>;
}

/** Text field + label above, helper/error below. */
export const fieldCls =
  "w-full rounded-[14px] bg-s-surface ring-1 ring-s-line/15 px-4 py-3.5 text-s-fg placeholder:text-s-muted/70 transition focus:outline-none focus:ring-2 focus:ring-s-fg/50";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 content-start">
      <span className="text-sm font-semibold text-s-fg">{label}</span>
      {children}
      {hint ? <span className="text-xs text-s-muted">{hint}</span> : null}
    </label>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[28px] bg-s-surface ring-1 ring-s-line/[0.07] p-6 sm:p-7", className)}>{children}</div>;
}

export function FormError({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="text-sm font-semibold text-[#C2412D] dark:text-[#F08A72]">{children}</p>;
}
