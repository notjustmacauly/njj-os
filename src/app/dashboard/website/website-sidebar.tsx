"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Package,
  ReceiptText,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/roles";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
};

type Section = { label: string; items: Item[] };

// The Website workspace replaces the OS sidebar entirely while you're under
// /dashboard/website — a separate "mode" with its own nav. "soon" items are
// the next phases of the site plan.
const SECTIONS: Section[] = [
  {
    label: "Website",
    items: [{ href: "/dashboard/website", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Shop",
    items: [
      { href: "/dashboard/website/orders", label: "Orders", icon: ReceiptText },
      { href: "/dashboard/website/products", label: "Products", icon: Package },
    ],
  },
  {
    label: "Community",
    items: [
      { href: "/dashboard/website/events", label: "Events & Passes", icon: CalendarDays },
      { href: "#members", label: "Members", icon: Trophy, soon: true },
    ],
  },
  {
    label: "Site",
    items: [{ href: "#content", label: "Content", icon: FileText, soon: true }],
  },
];

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "User";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function WebsiteSidebar({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  // Badge on Orders: website payments still waiting to be checked.
  const [toVerify, setToVerify] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("web_checkouts")
      .select("id", { count: "exact", head: true })
      .eq("payment_verification", "unverified")
      .then(({ count }) => {
        if (alive) setToVerify(count ?? 0);
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  return (
    <aside className="w-60 bg-ink text-white flex flex-col h-dvh overflow-y-auto lg:sticky lg:top-0 overscroll-contain">
      {/* Brand band */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="font-serif font-bold text-2xl tracking-tight">NotJust</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-smallcaps text-white/50 font-semibold">
          Website studio
        </div>
      </div>

      {/* Way back to the OS */}
      <div className="px-3 pt-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 w-full px-4 py-3 rounded-lg bg-berry text-white font-bold text-sm shadow-card hover:bg-berry/90 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Operations
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mt-5 first:mt-4">
            <div className="px-3 mb-2 text-[10px] uppercase tracking-smallcaps font-semibold text-white/40">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                if (item.soon) {
                  return (
                    <span
                      key={item.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white/35 cursor-not-allowed"
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                      <span className="ml-auto text-[9px] uppercase tracking-smallcaps">soon</span>
                    </span>
                  );
                }
                const active =
                  item.href === "/dashboard/website"
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition",
                      active
                        ? "bg-white/10 text-white font-semibold"
                        : "text-white/70 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                    {item.href === "/dashboard/website/orders" && toVerify > 0 ? (
                      <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-berry text-white text-[11px] font-bold flex items-center justify-center">
                        {toVerify}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10 space-y-2">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition"
        >
          <ExternalLink className="w-4 h-4" />
          View live site
        </a>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/5" title={email}>
          <span aria-hidden>🐝</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{displayNameFromEmail(email)}</div>
            <div className="text-[10px] uppercase tracking-smallcaps text-white/50">{role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
