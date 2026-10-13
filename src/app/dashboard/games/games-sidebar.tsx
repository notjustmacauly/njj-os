"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ExternalLink, LayoutGrid, Radio, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { SPORTS } from "./logic";

function displayNameFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "").replace(/^notjust/i, "");
  if (!local) return "User";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Game Day is its own workspace (like Website studio): under /dashboard/games
 * the OS sidebar is swapped for this one, so Operations stays uncluttered.
 */
export function GamesSidebar({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  const [live, setLive] = React.useState<Array<{ id: string; sport: string }>>([]);

  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("game_sessions")
      .select("id, sport")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (alive) setLive((data ?? []) as Array<{ id: string; sport: string }>);
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  const item = (href: string, active: boolean) =>
    cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition",
      active ? "bg-white/10 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white",
    );

  return (
    <aside className="w-60 bg-ink text-white flex flex-col h-dvh overflow-y-auto lg:sticky lg:top-0 overscroll-contain">
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="font-serif font-bold text-2xl tracking-tight flex items-center gap-2">
          <Trophy className="w-5 h-5 text-salmon" /> Game Day
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-smallcaps text-white/50 font-semibold">Courts · queue · scores</div>
      </div>

      <div className="px-3 pt-4">
        <Link
          href="/hub"
          className="flex items-center gap-2 w-full px-4 py-3 rounded-lg bg-berry text-white font-bold text-sm shadow-card hover:bg-berry/90 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Directory
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2">
        <div className="mt-4 px-3 mb-2 text-[10px] uppercase tracking-smallcaps font-semibold text-white/40">Game Day</div>
        <div className="space-y-0.5">
          <Link href="/dashboard/games" className={item("/dashboard/games", pathname === "/dashboard/games")}>
            <LayoutGrid className="w-4 h-4" /> Sessions
          </Link>
          <a href="/leaderboard" target="_blank" rel="noreferrer" className={item("/leaderboard", false)}>
            <Trophy className="w-4 h-4" /> Leaderboard
            <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-60" />
          </a>
        </div>

        {live.length ? (
          <>
            <div className="mt-6 px-3 mb-2 text-[10px] uppercase tracking-smallcaps font-semibold text-white/40">Live now</div>
            <div className="space-y-0.5">
              {live.map((s) => (
                <Link key={s.id} href={`/dashboard/games/${s.id}`} className={item(`/dashboard/games/${s.id}`, pathname === `/dashboard/games/${s.id}`)}>
                  <Radio className="w-4 h-4 text-green" />
                  {SPORTS.find((x) => x.value === s.sport)?.label ?? s.sport}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </nav>

      <div className="px-3 py-3 border-t border-white/10">
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
