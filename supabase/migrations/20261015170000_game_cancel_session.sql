-- Cancel a Game Day session.
--   No results yet  -> the session is deleted (a mistaken or test start).
--   Has results     -> every game is voided, ratings are replayed without them,
--                      and the session is kept as 'cancelled' (spec: cancelled
--                      events are all-or-nothing and never count).
-- Finalized events must be reopened first.
alter table public.game_sessions drop constraint if exists game_sessions_status_check;
alter table public.game_sessions add constraint game_sessions_status_check
  check (status in ('open', 'closed', 'finalized', 'cancelled'));

create or replace function public.rr_cancel_session(p_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_s game_sessions%rowtype; v_had boolean;
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into v_s from game_sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if v_s.status = 'finalized' then raise exception 'This event is finalized. Reopen it first, then cancel.'; end if;

  select exists (select 1 from game_matches where session_id = p_session and status = 'done') into v_had;
  if not v_had then
    delete from game_sessions where id = p_session;
    return 'deleted';
  end if;

  update game_matches set status = 'void', finished_at = coalesce(finished_at, now())
   where session_id = p_session and status <> 'void';
  delete from game_matches where session_id = p_session and status = 'queued';
  update game_sessions set status = 'cancelled', closed_at = now() where id = p_session;
  if v_s.ruleset = 'rally_rank' then perform rr_replay_ratings(); end if;
  return 'cancelled';
end $$;
revoke all on function public.rr_cancel_session(uuid) from public, anon;
grant execute on function public.rr_cancel_session(uuid) to authenticated;

-- Cancelled events drop out of LP and the public event list.
create or replace view public.rr_event_player
with (security_invoker = false) as
  with games as (
    select gm.session_id, p.player_id,
           case when (gm.winner = 'a') = (p.player_id = any(gm.team_a)) then 1 else 0 end as won,
           case when p.player_id = any(gm.team_a) then gm.score_a - gm.score_b else gm.score_b - gm.score_a end as pd
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'rally_rank'
    cross join lateral unnest(gm.team_a || gm.team_b) as p(player_id)
    where gm.status = 'done' and gm.winner is not null
  ),
  agg as (
    select session_id, player_id, count(*)::int as n, sum(won)::int as w, coalesce(sum(pd), 0)::int as pd
    from games group by session_id, player_id
  )
  select gs.id as session_id, gs.sport, gs.format, gs.session_date, gs.status,
         public.rr_season_of(gs.session_date) as season,
         r.player_id, r.squad,
         coalesce(a.n, 0) as n, coalesce(a.w, 0) as w, coalesce(a.pd, 0) as pd,
         case when coalesce(a.n, 0) = 0 then 0::numeric(12,2)
              else round(least(1::numeric, a.n::numeric / 4)
                         * ((case when gs.format = 'double' then 2 else 1 end) * (20 + 80 * a.w::numeric / a.n) + r.bonus), 2)
         end::numeric(12,2) as lp,
         r.bonus
  from game_sessions gs
  join game_session_players r on r.session_id = gs.id
  left join agg a on a.session_id = gs.id and a.player_id = r.player_id
  where gs.ruleset = 'rally_rank' and gs.status <> 'cancelled';
revoke all on public.rr_event_player from public, anon;
grant select on public.rr_event_player to authenticated;
