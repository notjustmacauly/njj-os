"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { Sidebar } from "./sidebar";
import { RegisterSW } from "./register-sw";

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "User";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Responsive shell for every authenticated dashboard route.
 *
 *  lg: and above — persistent sidebar on the left, no top bar (desktop).
 *  Below lg:     — slide-in sidebar drawer triggered by a hamburger in a
 *                  fixed top bar. Backdrop dismisses. Auto-closes on
 *                  navigation. Body content gets top padding to clear the
 *                  bar.
 *
 * The Sidebar component itself is unchanged — we just slide it as a
 * unit. The notifications bell + user identity still live inside its
 * footer; on mobile they're accessible after opening the drawer.
 */
export function AppShell({
  role,
  email,
  children,
}: {
  role: Role;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);

  // Close the drawer whenever the route changes — common pattern.
  React.useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open (mobile only).
  React.useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // Close on Escape.
  React.useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const displayName = displayNameFromEmail(email);

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-cream">
      <RegisterSW />
      {/* Mobile top bar — hamburger + brand + role chip. Hidden on lg+. */}
      <header className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-border z-30 flex items-center px-3 gap-2">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          aria-expanded={navOpen}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-ink hover:bg-cream touch-manipulation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link
          href="/dashboard"
          className="font-serif font-bold text-ink text-base tracking-tight"
        >
          NJJ OS
        </Link>
        <div className="ml-auto flex items-center gap-2 px-2 py-1 rounded-md bg-cream">
          <span aria-hidden>🐝</span>
          <span className="text-sm font-semibold text-ink truncate max-w-[120px]">
            {displayName}
          </span>
          <span className="text-[10px] uppercase tracking-smallcaps text-inkSoft">
            {role}
          </span>
        </div>
      </header>

      {/* Backdrop while drawer is open. */}
      <div
        onClick={() => setNavOpen(false)}
        aria-hidden
        className={cn(
          "lg:hidden fixed inset-0 bg-ink/40 z-40 transition-opacity",
          navOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Sidebar wrapper — slide-in on mobile, static on lg+. */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:relative lg:z-0 lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Close button visible only inside the mobile drawer. */}
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
          className="lg:hidden absolute top-2 right-2 z-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md text-inkSoft hover:bg-cream touch-manipulation"
        >
          <X className="w-4 h-4" />
        </button>
        <Sidebar role={role} email={email} />
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-20 pb-8 lg:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
