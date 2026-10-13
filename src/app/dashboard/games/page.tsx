import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, hasRole, type Role } from "@/lib/roles";
import { NewSessionForm } from "./new-session-form";
import { SPORTS } from "./logic";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  sport: string;
  session_date: string;
  courts: number;
  team_size: number;
  status: string;
  events: { name: string } | null;
  game_session_players: Array<{ player_id: string }>;
  game_matches: Array<{ status: string }>;
};

export default async function GamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!hasRole(roleRow?.role as Role | null, ALL_ROLES)) redirect("/dashboard");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const shift = (d: number) => {
    const x = new Date(`${today}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + d);
    return x.toISOString().slice(0, 10);
  };

  const [{ data: sessions }, { data: events }] = await Promise.all([
    supabase
      .from("game_sessions")
      .select("id, sport, session_date, courts, team_size, status, events(name), game_session_players(player_id), game_matches(status)")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("events")
      .select("id, name, event_date, start_time")
      .is("deleted_at", null)
      .gte("event_date", shift(-1))
      .lte("event_date", shift(1))
      .order("event_date")
      .order("start_time"),
  ]);
  const rows = (sessions ?? []) as unknown as Row[];
  const label = (s: string) => SPORTS.find((x) => x.value === s)?.label ?? s;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif font-bold text-3xl text-ink flex items-center gap-2">
          <Trophy className="w-7 h-7 text-berry" />
          Game Day
        </h1>
        <p className="text-sm text-inkSoft mt-1">Run the courts, queue and scores. Results feed the website leaderboard.</p>
      </header>

      <NewSessionForm events={(events ?? []) as Array<{ id: string; name: string; event_date: string; start_time: string | null }>} />

      <section className="bg-white border border-border rounded-lg shadow-card">
        <h2 className="px-5 py-3 border-b border-border font-semibold text-ink">Sessions</h2>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-inkSoft text-center">No sessions yet. Start one above on game night.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/games/${r.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-cream/60">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink">
                      {label(r.sport)}
                      {r.events?.name ? <span className="font-normal text-inkSoft"> · {r.events.name}</span> : null}
                    </div>
                    <div className="text-xs text-inkSoft">
                      {new Date(`${r.session_date}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                      {" · "}
                      {r.courts} court{r.courts === 1 ? "" : "s"} · {r.team_size} a side
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold text-ink tabular-nums">{r.game_matches.filter((m) => m.status === "done").length} games</div>
                    <div className="text-xs text-inkSoft">{r.game_session_players.length} players</div>
                  </div>
                  <span
                    className={
                      r.status === "open"
                        ? "text-[11px] font-semibold rounded-full bg-greenBg text-green px-2 py-0.5"
                        : "text-[11px] font-semibold rounded-full bg-cream text-inkSoft px-2 py-0.5"
                    }
                  >
                    {r.status === "open" ? "Live" : "Closed"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
