"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";
import { useCart } from "./cart";
import { ShoppingBagLine } from "./icons";

const NAV: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Events", href: "/events" },
  { label: "Community", href: "/#community" },
  { label: "Partners", href: "/#partners" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

function CartButton() {
  const { lines, ready } = useCart();
  const n = ready ? lines.length : 0;
  return (
    <Link
      href="/shop/cart"
      aria-label={n ? `Cart, ${n} pack${n === 1 ? "" : "s"}` : "Cart"}
      className="relative inline-flex items-center justify-center w-11 h-11 rounded-full text-s-fg hover:bg-s-line/[0.06] transition duration-300 ease-settle active:scale-[0.96]"
    >
      <ShoppingBagLine className="w-[18px] h-[18px]" />
      {n > 0 ? (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-s-brand text-s-brand-fg text-[11px] font-bold flex items-center justify-center tabular-nums">
          {n}
        </span>
      ) : null}
    </Link>
  );
}

/** Floating island nav: the logo keeps its salmon plate, the rest stays quiet. */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 pt-3 sm:pt-4 px-3 sm:px-5">
      <nav
        aria-label="Main"
        className="mx-auto max-w-[1320px] h-16 rounded-full bg-s-surface/80 backdrop-blur-xl ring-1 ring-s-line/[0.08] shadow-float flex items-center gap-2 pl-2 pr-2"
      >
        <Link href="/" aria-label={COMPANY.brandName} className="shrink-0 h-12 rounded-full bg-s-brand px-5 flex items-center">
          <Image
            src="/just-juice-wordmark.png"
            alt={COMPANY.brandName}
            width={2720}
            height={660}
            priority
            className="h-6 w-auto"
          />
        </Link>

        <ul className="hidden md:flex items-center gap-1 mx-auto text-[15px] font-semibold">
          {NAV.map((n) => (
            <li key={n.label}>
              <Link
                href={n.href}
                aria-current={isActive(pathname, n.href) ? "page" : undefined}
                className={cn(
                  "px-4 py-2 rounded-full transition duration-300 ease-settle",
                  isActive(pathname, n.href) ? "bg-s-line/[0.07] text-s-fg" : "text-s-muted hover:text-s-fg",
                )}
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto md:ml-0 flex items-center gap-1">
          <CartButton />
          <Link
            href="/shop"
            className="hidden md:inline-flex items-center rounded-full bg-s-invert text-s-invert-fg px-5 h-11 text-sm font-semibold transition duration-300 ease-settle hover:bg-s-invert/90 active:scale-[0.98]"
          >
            Order now
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="md:hidden relative w-11 h-11 rounded-full hover:bg-s-line/[0.06] transition"
          >
            <span
              className={cn(
                "absolute left-1/2 top-1/2 h-[1.5px] w-5 -translate-x-1/2 bg-s-fg transition duration-500 ease-settle",
                open ? "rotate-45" : "-translate-y-[4px]",
              )}
            />
            <span
              className={cn(
                "absolute left-1/2 top-1/2 h-[1.5px] w-5 -translate-x-1/2 bg-s-fg transition duration-500 ease-settle",
                open ? "-rotate-45" : "translate-y-[4px]",
              )}
            />
          </button>
        </div>
      </nav>

      {/* Mobile: full-screen glass menu with staggered links */}
      <div
        className={cn(
          "md:hidden fixed inset-0 top-0 -z-10 bg-s-canvas/90 backdrop-blur-2xl transition-opacity duration-500 ease-settle",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <ul className="pt-28 px-6 space-y-2">
          {NAV.map((n, i) => (
            <li
              key={n.label}
              className={cn("transition duration-700 ease-settle", open ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0")}
              style={{ transitionDelay: open ? `${80 + i * 50}ms` : "0ms" }}
            >
              <Link href={n.href} onClick={() => setOpen(false)} className="block py-2 font-display text-4xl font-semibold tracking-[-0.03em] text-s-fg">
                {n.label}
              </Link>
            </li>
          ))}
          <li
            className={cn("pt-6 transition duration-700 ease-settle", open ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0")}
            style={{ transitionDelay: open ? "380ms" : "0ms" }}
          >
            <Link href="/shop" onClick={() => setOpen(false)} className="inline-flex rounded-full bg-s-invert text-s-invert-fg px-7 py-4 font-semibold">
              Order now
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
