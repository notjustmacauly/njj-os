"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; soon?: boolean };

// Website admin tabs. "soon" tabs are the next phases of the site plan
// (passes + events, member accounts + leaderboard, page content).
const ITEMS: Item[] = [
  { href: "/dashboard/website", label: "Overview" },
  { href: "/dashboard/website/products", label: "Products" },
  { href: "#events", label: "Events & Passes", soon: true },
  { href: "#members", label: "Members", soon: true },
  { href: "#content", label: "Content", soon: true },
];

export function WebsiteSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border -mx-6 px-6 overflow-x-auto">
      {ITEMS.map((it) =>
        it.soon ? (
          <span
            key={it.href}
            className="px-4 py-2 text-sm font-medium text-inkSoft/50 cursor-not-allowed border-b-2 border-transparent inline-flex items-center gap-1 whitespace-nowrap"
          >
            {it.label}
            <span className="text-[9px] uppercase tracking-smallcaps">soon</span>
          </span>
        ) : (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap",
              (it.href === "/dashboard/website"
                ? pathname === it.href
                : pathname === it.href || pathname.startsWith(it.href + "/"))
                ? "text-berry border-berry"
                : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {it.label}
          </Link>
        ),
      )}
    </nav>
  );
}
