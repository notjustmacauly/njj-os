"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Factory,
  Ticket,
  Users,
  Wallet,
  Settings,
  ShoppingCart,
  LogOut,
  Plus,
} from "lucide-react";

type Role = "admin" | "manager" | "ops" | "staff";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
};

type Section = {
  label: string;
  items: NavItem[];
};

const SECTIONS: Section[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["admin", "manager", "ops", "staff"],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/orders",     label: "Orders",     icon: Package,  roles: ["admin", "manager", "ops"] },
      { href: "/dashboard/production", label: "Production", icon: Factory,  roles: ["admin", "manager", "ops"] },
      { href: "/dashboard/partners",   label: "Partners",   icon: Users,    roles: ["admin", "manager", "ops"] },
    ],
  },
  {
    label: "Events",
    items: [
      { href: "/dashboard/tickets", label: "Tickets", icon: Ticket, roles: ["admin", "manager", "ops", "staff"] },
    ],
  },
  {
    label: "Accounting",
    items: [
      { href: "/dashboard/finance", label: "Finance", icon: Wallet, roles: ["admin", "manager", "ops"] },
      {
        href: "/dashboard/finance/reimbursements",
        label: "Reimbursement",
        icon: Wallet,
        roles: ["staff"],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings, roles: ["admin", "manager"] },
    ],
  },
];

const POS_ROLES: Role[] = ["admin", "manager", "ops", "staff"];

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "User";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function Sidebar({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [now, setNow] = React.useState<string>("");

  React.useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
      });
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const name = displayNameFromEmail(email);

  return (
    <aside className="w-60 bg-white border-r border-border flex flex-col">
      {/* Salmon header band — brand wordmark */}
      <div className="bg-salmon">
        <Image
          src="/just-juice-logo.png"
          alt="Just Juice."
          width={480}
          height={240}
          priority
          className="w-full h-auto block"
        />
      </div>

      {/* Big Event POS CTA */}
      {POS_ROLES.includes(role) ? (
        <div className="px-3 pt-4">
          <Link
            href="/dashboard/pos"
            className="flex items-center justify-between gap-2 bg-berry text-white px-4 py-3 rounded-lg font-bold text-sm shadow-card hover:bg-berry/90 transition"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Event POS
            </span>
            <span className="bg-white/15 rounded-md p-1">
              <Plus className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>
      ) : null}

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {SECTIONS.map((section) => {
          const items = section.items.filter((i) => i.roles.includes(role));
          if (items.length === 0) return null;
          return (
            <div key={section.label} className="mt-5 first:mt-4">
              <div className="px-3 mb-2 text-[10px] uppercase tracking-smallcaps font-semibold text-inkSoft">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition",
                        active
                          ? "bg-berryBg text-berry font-semibold"
                          : "text-inkSoft hover:bg-cream hover:text-ink",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer: user identity + sign-out + live status */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-cream"
          title={email}
        >
          <span aria-hidden>🐝</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink truncate">{name}</div>
            <div className="text-[10px] uppercase tracking-smallcaps text-inkSoft">
              {role}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-inkSoft hover:bg-cream hover:text-ink transition"
        >
          <LogOut className="w-4 h-4" />
          Switch User
        </button>
        <div className="px-3 pt-1 flex items-center gap-2 text-xs text-inkSoft">
          <span className="inline-block w-2 h-2 rounded-full bg-green" />
          Live{now ? ` · synced ${now}` : ""}
        </div>
      </div>
    </aside>
  );
}
