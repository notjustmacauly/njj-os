import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowUpRight, LayoutDashboard, Trophy, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasRole, ALL_ROLES, TRACKER_ROLES, type Role } from "@/lib/roles";
import { HubSignOut } from "./sign-out";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Directory · NotJust", robots: { index: false } };

// Staff landing page after login: pick a workspace. Customers (no staff role)
// never see it; they go to their own account.
export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: roleRow }, { data: member }, { data: liveSessions }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
    supabase.from("team_members").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("game_sessions").select("id").eq("status", "open"),
  ]);
  const role = (roleRow?.role as Role | null) ?? null;
  if (!hasRole(role, TRACKER_ROLES)) redirect("/account");

  const first = (member?.display_name ?? user.email?.split("@")[0] ?? "").split(" ")[0];
  const live = (liveSessions ?? []).length;
  const canGames = hasRole(role, ALL_ROLES);

  const cards: Array<{
    href: string;
    title: string;
    body: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: string;
    badge?: string;
    show: boolean;
  }> = [
    {
      href: "/dashboard",
      title: "Operations",
      body: "Orders, production, inventory, finance, team and the website studio.",
      icon: LayoutDashboard,
      tone: "bg-white",
      show: true,
    },
    {
      href: "/dashboard/games",
      title: "Game Day",
      body: "Run the courts and queue, enter scores, and see the leaderboard.",
      icon: Trophy,
      tone: "bg-salmon/40",
      badge: live ? `${live} live` : undefined,
      show: canGames,
    },
    {
      href: "/account",
      title: "Personal",
      body: "Your own player account: passes, orders and your leaderboard standing.",
      icon: UserRound,
      tone: "bg-white",
      show: true,
    },
  ];

  return (
    <main className="min-h-[100dvh] bg-cream px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex h-11 rounded-full bg-salmon px-5 items-center">
            <Image src="/just-juice-wordmark.png" alt="Not Just Juice" width={2720} height={660} className="h-5 w-auto" priority />
          </span>
          <HubSignOut />
        </div>

        <h1 className="mt-12 font-serif font-bold text-4xl sm:text-5xl text-ink">{first ? `Hi, ${first}.` : "Welcome back."}</h1>
        <p className="mt-2 text-inkSoft">Where are you headed?</p>

        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {cards
            .filter((c) => c.show)
            .map((c) => {
              const Icon = c.icon;
              return (
                <li key={c.href}>
                  <Link
                    href={c.href}
                    className={`group flex h-full flex-col rounded-2xl ${c.tone} ring-1 ring-border p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="w-11 h-11 rounded-xl bg-berryBg text-berry flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                      </span>
                      {c.badge ? (
                        <span className="rounded-full bg-greenBg text-green text-xs font-semibold px-2.5 py-1">{c.badge}</span>
                      ) : null}
                    </div>
                    <h2 className="mt-8 font-serif font-bold text-2xl text-ink">{c.title}</h2>
                    <p className="mt-2 text-sm text-inkSoft flex-1">{c.body}</p>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-berry">
                      Open <ArrowUpRight className="w-4 h-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
        </ul>
      </div>
    </main>
  );
}
