"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Role = "admin" | "manager" | "ops" | "staff";

const ITEMS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard/finance", label: "Overview", roles: ["admin", "manager", "ops"] },
  { href: "/dashboard/finance/revenue", label: "Revenue", roles: ["admin", "manager", "ops"] },
  { href: "/dashboard/finance/expenses", label: "Expenses", roles: ["admin", "manager", "ops"] },
  { href: "/dashboard/finance/payments", label: "Payments", roles: ["admin", "manager", "ops"] },
  {
    href: "/dashboard/finance/reimbursements",
    label: "Reimbursements",
    roles: ["admin", "manager", "ops", "staff"],
  },
  { href: "/dashboard/finance/bills", label: "Bills", roles: ["admin", "manager"] },
  { href: "/dashboard/finance/receivables", label: "Receivables", roles: ["admin", "manager", "ops"] },
  { href: "/dashboard/finance/accounts", label: "Accounts", roles: ["admin", "manager", "ops"] },
];

export function FinanceSubNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const visible = ITEMS.filter((it) => it.roles.includes(role));
  if (visible.length <= 1) return null;
  return (
    <nav className="flex gap-1 border-b border-border -mx-6 px-6 overflow-x-auto">
      {visible.map((it) => {
        const active =
          it.href === "/dashboard/finance"
            ? pathname === it.href
            : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap",
              active
                ? "text-berry border-berry"
                : "text-inkSoft border-transparent hover:text-ink",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
