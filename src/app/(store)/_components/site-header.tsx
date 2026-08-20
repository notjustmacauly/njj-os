"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { COMPANY } from "@/lib/company";

const NAV: Array<{ label: string; href: string }> = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Events", href: "/#events" },
  { label: "Community", href: "/#community" },
  { label: "Partners", href: "/#partners" },
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 bg-brandpink text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
        <Link href="/" aria-label={COMPANY.brandName} className="shrink-0">
          <Image
            src="/just-juice-wordmark.png"
            alt={COMPANY.brandName}
            width={2720}
            height={660}
            priority
            className="h-9 sm:h-11 w-auto"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-[15px] font-semibold">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              className="px-3.5 py-2 rounded-full text-white/90 hover:text-white hover:bg-white/15 transition"
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/shop"
            className="ml-2 px-5 py-2 rounded-full bg-white text-brandpink font-semibold hover:bg-white/90 transition"
          >
            Order now
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/15 transition"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <nav className="md:hidden bg-brandpink border-t border-white/20 px-4 pb-4 pt-1">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block px-2 py-3 text-lg font-semibold text-white/95 border-b border-white/10 last:border-0"
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/shop"
            onClick={() => setOpen(false)}
            className="mt-3 block text-center px-5 py-3 rounded-full bg-white text-brandpink font-semibold"
          >
            Order now
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
