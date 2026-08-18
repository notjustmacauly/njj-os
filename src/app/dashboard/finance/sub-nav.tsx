"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ALL_ROLES, type Role } from "@/lib/roles";

type Group = "billing" | "financials" | "spending";

type Item = { href: string; label: string; roles: readonly Role[]; group: Group };

// Three role-scoped tab groups. The sub-nav shows only the group the current
// page belongs to, so each sidebar tab (Billing / Financials / Spending) has
// its own tab bar.
const ITEMS: Item[] = [
  // Billing — receivables → bills. Chrissia (manager) included.
  { href: "/dashboard/finance/billing", label: "Dashboard", roles: ["owner", "partner", "manager"], group: "billing" },
  { href: "/dashboard/finance/receivables", label: "Receivables", roles: ["owner", "partner", "manager"], group: "billing" },
  { href: "/dashboard/finance/bills", label: "Bills", roles: ["owner", "partner", "manager"], group: "billing" },

  // Financials — owner only.
  { href: "/dashboard/finance", label: "Overview", roles: ["owner"], group: "financials" },
  { href: "/dashboard/finance/reports", label: "Reports", roles: ["owner"], group: "financials" },
  { href: "/dashboard/finance/revenue", label: "Revenue", roles: ["owner"], group: "financials" },
  { href: "/dashboard/finance/accounts", label: "Accounts", roles: ["owner"], group: "financials" },

  // Spending — money out. Staff see Reimbursements only.
  { href: "/dashboard/finance/expenses", label: "Expenses", roles: ["owner", "partner", "manager"], group: "spending" },
  { href: "/dashboard/finance/payments", label: "Payments", roles: ["owner", "partner", "manager"], group: "spending" },
  { href: "/dashboard/finance/reimbursements", label: "Reimbursements", roles: ALL_ROLES, group: "spending" },
  { href: "/dashboard/finance/payees", label: "Payees", roles: ["owner", "partner", "manager"], group: "spending" },
];

function groupForPath(pathname: string): Group {
  const startsAny = (...prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (startsAny("/dashboard/finance/billing", "/dashboard/finance/receivables", "/dashboard/finance/bills")) {
    return "billing";
  }
  if (startsAny("/dashboard/finance/expenses", "/dashboard/finance/payments", "/dashboard/finance/reimbursements", "/dashboard/finance/payees")) {
    return "spending";
  }
  return "financials"; // overview + reports/revenue/accounts, and the bare /dashboard/finance
}

export function FinanceSubNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const group = groupForPath(pathname);
  const visible = ITEMS.filter((it) => it.group === group && it.roles.includes(role));
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
