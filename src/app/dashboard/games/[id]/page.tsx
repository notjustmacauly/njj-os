import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, hasRole, type Role } from "@/lib/roles";
import { GameBoard, type BoardData } from "./game-board";
import { VolleyBoard, type VolleyData } from "./volley-board";

export const dynamic = "force-dynamic";

export default async function GameSessionPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!hasRole(roleRow?.role as Role | null, ALL_ROLES)) redirect("/dashboard");

  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, sport, session_date, courts, team_size, status, ruleset, format, title, event_id, rivalry_games, events(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: roster }, { data: matches }, { data: master }, { data: passes }] = await Promise.all([
    supabase
      .from("game_session_players")
      .select("player_id, active, waiting_since, joined_at, squad, pair_no, queue_offset, game_players(id, display_name, email, rating, skill_level, seed_rating)")
      .eq("session_id", session.id),
    supabase
      .from("game_matches")
      .select("id, court, team_a, team_b, score_a, score_b, winner, finish, status, started_at, finished_at")
      .eq("session_id", session.id)
      .neq("status", "void")
      .order("started_at"),
    supabase.from("game_players").select("id, display_name, email, rating, skill_level, seed_rating").order("display_name").limit(2000),
    session.event_id
      ? supabase
          .from("tickets")
          .select("id, holder_name, holder_email, buyer_name, buyer_email, ticket_type_name, checked_in_at")
          .eq("event_id", session.event_id)
          .not("pass_token", "is", null)
          .is("deleted_at", null)
          .not("checked_in_at", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  // The player is the pass holder: a friend's pass carries their own email (or
  // none), never the buyer's.
  type PassRow = { id: string; holder_name: string | null; holder_email: string | null; buyer_name: string | null; buyer_email: string | null; ticket_type_name: string; checked_in_at: string };
  const playerPasses = ((passes ?? []) as PassRow[]).map((t) => ({
    id: t.id,
    holder_name: t.holder_name ?? t.buyer_name,
    buyer_email: t.holder_email ?? (!t.holder_name || t.holder_name === t.buyer_name ? t.buyer_email : null),
    ticket_type_name: t.ticket_type_name,
    checked_in_at: t.checked_in_at,
  }));

  if (session.ruleset === "spike_chill") {
    const [{ data: vbRoster }, { data: vbMatches }, { data: ratings }] = await Promise.all([
      supabase
        .from("game_session_players")
        .select("player_id, active, joined_at, block1_team, block2_team, game_players(id, display_name, email, rating, seed_rating)")
        .eq("session_id", session.id),
      supabase
        .from("game_matches")
        .select("id, game_no, block, label_a, label_b, team_a, team_b, score_a, score_b, winner, outcome, is_draw, status")
        .eq("session_id", session.id)
        .not("game_no", "is", null)
        .order("game_no"),
      supabase.from("game_sport_ratings").select("player_id, rating, rated_count, level, tags").eq("sport", "volleyball").limit(5000),
    ]);
    const vb: VolleyData = {
      role: (roleRow?.role ?? "staff") as string,
      session: session as unknown as VolleyData["session"],
      roster: (vbRoster ?? []) as unknown as VolleyData["roster"],
      matches: (vbMatches ?? []) as unknown as VolleyData["matches"],
      master: (master ?? []) as unknown as VolleyData["master"],
      ratings: (ratings ?? []) as unknown as VolleyData["ratings"],
      passes: playerPasses,
    };
    return <VolleyBoard data={vb} />;
  }

  const ids = ((roster ?? []) as Array<{ player_id: string }>).map((r) => r.player_id);
  const { data: status } = ids.length
    ? await supabase.from("rr_player_status").select("player_id, provisional, finalized_events").in("player_id", ids)
    : { data: [] };

  const data = {
    role: (roleRow?.role ?? "staff") as string,
    provisional: Object.fromEntries(((status ?? []) as Array<{ player_id: string; provisional: boolean }>).map((x) => [x.player_id, x.provisional])),
    session: session as unknown as BoardData["session"],
    roster: (roster ?? []) as unknown as BoardData["roster"],
    matches: (matches ?? []) as BoardData["matches"],
    master: (master ?? []) as BoardData["master"],
    passes: playerPasses,
  };
  return <GameBoard data={data} />;
}
