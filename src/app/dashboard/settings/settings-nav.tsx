"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TRACKER_ROLES, type Role } from "@/lib/roles";

type Item = { href: string; match: string; label: string; roles: readonly Role[] };

// Everything that used to be its own sidebar row under "Settings" now lives
// here as a tab, so the sidebar only needs the single gear entry.
const ITEMS: Item[] = [
  { href: "/dashboard/settings/catalog?tab=skus", match: "/dashboard/settings/catalog", label: "Catalog", roles: TRACKER_ROLES },
  { href: "/dashboard/settings/notifications", match: "/dashboard/settings/notifications", label: "Notifications", roles: TRACKER_ROLES },
  // Owner gets the full team hub (profiles, pay, payslips); partner/manager
  // keep the lighter access list they had before.
  { href: "/dashboard/team", match: "/dashboard/team", label: "Team", roles: ["owner"] },
  { href: "/dashboard/settings/team", match: "/dashboard/settings/team", label: "Team", roles: ["partner", "manager"] },
  { href: "/dashboard/settings/activity", match: "/dashboard/settings/activity", label: "Activity Log", roles: ["owner"] },
  { href: "/dashboard/settings/telegram", match: "/dashboard/settings/telegram", label: "Expense bot", roles: ["owner"] },
];

export function SettingsSubNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const visible = ITEMS.filter((it) => it.roles.includes(role));
  if (visible.length <= 1) return null;
  return (
    <nav className="flex gap-1 border-b border-border -mx-6 px-6 overflow-x-auto">
      {visible.map((it) => {
        const active = pathname === it.match || pathname.startsWith(it.match + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap",
              active ? "text-berry border-berry" : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
