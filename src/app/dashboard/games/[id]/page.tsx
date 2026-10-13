import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, hasRole, type Role } from "@/lib/roles";
import { GameBoard, type BoardData } from "./game-board";

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
    .select("id, sport, session_date, courts, team_size, status, event_id, events(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: roster }, { data: matches }, { data: master }, { data: passes }] = await Promise.all([
    supabase
      .from("game_session_players")
      .select("player_id, active, waiting_since, joined_at, game_players(id, display_name, email, rating, skill_level)")
      .eq("session_id", session.id),
    supabase
      .from("game_matches")
      .select("id, court, team_a, team_b, score_a, score_b, winner, status, started_at, finished_at")
      .eq("session_id", session.id)
      .neq("status", "void")
      .order("started_at"),
    supabase.from("game_players").select("id, display_name, email, rating, skill_level").order("display_name").limit(2000),
    session.event_id
      ? supabase
          .from("tickets")
          .select("id, holder_name, buyer_email, ticket_type_name, checked_in_at")
          .eq("event_id", session.event_id)
          .not("pass_token", "is", null)
          .is("deleted_at", null)
          .not("checked_in_at", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const data = {
    session: session as unknown as BoardData["session"],
    roster: (roster ?? []) as unknown as BoardData["roster"],
    matches: (matches ?? []) as BoardData["matches"],
    master: (master ?? []) as BoardData["master"],
    passes: (passes ?? []) as BoardData["passes"],
  };
  return <GameBoard data={data} />;
}
