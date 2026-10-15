-- =================================================================
-- Rally & Rank 2.0 (docs/specs/RALLY_AND_RANK_2_SPEC.txt), first applied to
-- badminton. Replaces the Win 3 / Loss 1 / +2 points.
--
--  League Points per event  LP = q × [M × (20 + 80 × W/N) + B]
--                           q = min(1, N/4); M = 2 on Double Points nights;
--                           B = Team squad bonus +10 / +5 (Rivalry later).
--  Rating                   1.00 to 6.00, Elo-style on side averages, scale 0.50.
--                           K = 0.20 for games in a player's first 2 events,
--                           then 0.10. Seeded from the level staff pick.
--  Games                    to 21, win by 2, cap 30; or "time called" (any lead).
--  Seasons                  S1 = 1 Nov to 31 Dec 2026, then calendar quarters.
--                           Only finalized events count toward a season.
--
-- Ratings are always rebuilt by replaying every Rally & Rank game in start
-- order (rr_replay_ratings), so a corrected or voided result is exact.
-- Casual sessions (ruleset 'casual') never touch ratings or leaderboards.
-- =================================================================

-- Retire the Win 3 / Loss 1 views (first, so column types can change).
drop view if exists public.web_leaderboard;
drop view if exists public.game_season_points;

-- Sessions: ruleset, format, finalized state ---------------------------------------
alter table public.game_sessions
  add column if not exists ruleset text not null default 'casual',
  add column if not exists format text,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid;
alter table public.game_sessions drop constraint if exists game_sessions_ruleset_check;
alter table public.game_sessions add constraint game_sessions_ruleset_check check (ruleset in ('casual', 'rally_rank'));
alter table public.game_sessions drop constraint if exists game_sessions_format_check;
alter table public.game_sessions add constraint game_sessions_format_check
  check (format is null or format in ('classic', 'team', 'double', 'rivalry'));
alter table public.game_sessions drop constraint if exists game_sessions_status_check;
alter table public.game_sessions add constraint game_sessions_status_check check (status in ('open', 'closed', 'finalized'));

-- Roster: squads, pairs, late-arrival fairness offset, placement bonus -------------
alter table public.game_session_players
  add column if not exists squad text,
  add column if not exists pair_no integer,
  add column if not exists queue_offset integer not null default 0,
  add column if not exists bonus numeric(5,2) not null default 0;
alter table public.game_session_players drop constraint if exists game_session_players_squad_check;
alter table public.game_session_players add constraint game_session_players_squad_check check (squad is null or squad in ('A', 'B', 'C'));

-- Players: 1.00 to 6.00 rating at full precision, plus the seed -------------------
alter table public.game_players drop constraint if exists game_players_rating_check;
alter table public.game_players alter column rating type numeric(9,6);
alter table public.game_players alter column rating set default 2.500000;
alter table public.game_players add constraint game_players_rating_check check (rating between 1 and 6);
alter table public.game_players
  add column if not exists seed_rating numeric(9,6),
  add column if not exists seeded_at timestamptz;
alter table public.game_players drop constraint if exists game_players_seed_rating_check;
alter table public.game_players add constraint game_players_seed_rating_check check (seed_rating is null or seed_rating between 1 and 6);

-- Matches: finish reason; scores (Rally & Rank validates the 30 cap itself) ----------
alter table public.game_matches add column if not exists finish text;
alter table public.game_matches drop constraint if exists game_matches_finish_check;
alter table public.game_matches add constraint game_matches_finish_check check (finish is null or finish in ('target', 'timed'));
alter table public.game_matches drop constraint if exists game_matches_score_a_check;
alter table public.game_matches drop constraint if exists game_matches_score_b_check;
alter table public.game_matches add constraint game_matches_score_a_check check (score_a between 0 and 99);
alter table public.game_matches add constraint game_matches_score_b_check check (score_b between 0 and 99);

-- Rating ledger (rebuilt on every replay) ------------------------------------------
create table if not exists public.rr_rating_ledger (
  match_id   uuid not null references public.game_matches(id) on delete cascade,
  player_id  uuid not null references public.game_players(id),
  seq        integer not null,
  prior      numeric(9,6) not null,
  k          numeric(4,2) not null,
  expected   numeric(12,9) not null,
  result     smallint not null,
  new_rating numeric(9,6) not null,
  primary key (match_id, player_id)
);
create index if not exists rr_rating_ledger_player_idx on public.rr_rating_ledger (player_id, seq);
alter table public.rr_rating_ledger enable row level security;
drop policy if exists rr_rating_ledger_staff on public.rr_rating_ledger;
create policy rr_rating_ledger_staff on public.rr_rating_ledger for select to authenticated
  using (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'));

-- Helpers ---------------------------------------------------------------------------
create or replace function public.rr_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff')
$$;

-- Season number for a local event date: 1 = Nov–Dec 2026, then quarters (2 = Q1 2027).
create or replace function public.rr_season_of(d date) returns integer
language sql immutable as $$
  select case
    when d < date '2026-11-01' then null
    when d < date '2027-01-01' then 1
    else 2 + (extract(year from d)::int - 2027) * 4 + (extract(quarter from d)::int - 1)
  end
$$;

-- Starting rating for a level pick (centre of each staff-only division).
create or replace function public.rr_level_seed(p_level text) returns numeric
language sql immutable as $$
  select case p_level when 'beginner' then 1.50 when 'intermediate' then 2.60
                      when 'advanced' then 3.85 when 'pro' then 5.25 end::numeric
$$;

-- Valid badminton score? target: 21 win by 2, cap 30. timed: any lead, ≤ 30.
create or replace function public.rr_valid_score(w integer, l integer, p_finish text) returns boolean
language sql immutable as $$
  select w is not null and l is not null and w > l and l >= 0 and w <= 30 and case p_finish
    when 'target' then (w = 21 and l <= 19) or (w between 22 and 30 and l = w - 2) or (w = 30 and l = 29)
    when 'timed' then true
    else false end
$$;

-- Replay every Rally & Rank game in start order and rewrite all ratings -----------
create or replace function public.rr_replay_ratings() returns void
language plpgsql security definer set search_path = public as $$
declare
  m record;
  ra numeric; rb numeric; ea numeric;
  v_seq integer := 0;
begin
  drop table if exists pg_temp.rr_r;
  create temp table rr_r (id uuid primary key, r numeric) on commit drop;
  insert into rr_r select id, coalesce(seed_rating, 2.5) from game_players;

  -- Event ordinal per player: games in their 1st and 2nd Rally & Rank events use K 0.20.
  drop table if exists pg_temp.rr_ord;
  create temp table rr_ord on commit drop as
    select player_id, session_id,
           dense_rank() over (partition by player_id order by session_date, session_created, session_id) as ord
    from (
      select distinct p.player_id, gs.id as session_id, gs.session_date, gs.created_at as session_created
      from game_matches gm
      join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'rally_rank'
      cross join lateral unnest(gm.team_a || gm.team_b) as p(player_id)
      where gm.status = 'done' and gm.winner is not null
    ) x;

  delete from rr_rating_ledger;

  for m in
    select gm.id, gm.session_id, gm.team_a, gm.team_b, gm.winner
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'rally_rank'
    where gm.status = 'done' and gm.winner is not null
    order by gm.started_at, gm.id
  loop
    v_seq := v_seq + 1;
    select avg(r) into ra from rr_r where id = any(m.team_a);
    select avg(r) into rb from rr_r where id = any(m.team_b);
    ea := 1 / (1 + power(10::numeric, (rb - ra) / 0.5));
    -- All four deltas from the same pre-match snapshot.
    insert into rr_rating_ledger (match_id, player_id, seq, prior, k, expected, result, new_rating)
    select m.id, t.pid, v_seq, round(r.r, 6), k.k, round(t.e, 9), t.s,
           round(least(6, greatest(1, r.r + k.k * (t.s - t.e))), 6)
    from (
      select unnest(m.team_a) as pid, ea as e, case when m.winner = 'a' then 1 else 0 end as s
      union all
      select unnest(m.team_b), 1 - ea, case when m.winner = 'b' then 1 else 0 end
    ) t
    join rr_r r on r.id = t.pid
    cross join lateral (
      select case when coalesce((select ord from rr_ord o where o.player_id = t.pid and o.session_id = m.session_id), 1) <= 2
                  then 0.20 else 0.10 end::numeric(4,2) as k
    ) k;
    update rr_r set r = l.new_rating from rr_rating_ledger l where l.match_id = m.id and l.player_id = rr_r.id;
  end loop;

  update game_players p set rating = round(r.r, 6), updated_at = now()
  from rr_r r where r.id = p.id and p.rating is distinct from round(r.r, 6);
end $$;
revoke all on function public.rr_replay_ratings() from public, anon, authenticated;

-- Record (or correct) a result ----------------------------------------------------
create or replace function public.rr_record_result(p_match uuid, p_winner text, p_score_a integer, p_score_b integer, p_finish text default 'target')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m game_matches%rowtype;
  v_s game_sessions%rowtype;
  v_now timestamptz := now();
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into v_m from game_matches where id = p_match for update;
  if not found then raise exception 'Game not found'; end if;
  select * into v_s from game_sessions where id = v_m.session_id;
  if v_s.status = 'finalized' then raise exception 'This event is finalized. Reopen it to change results.'; end if;
  if v_m.status not in ('playing', 'done') then raise exception 'That game is not on court.'; end if;
  if p_winner not in ('a', 'b') then raise exception 'Pick the winning side.'; end if;
  if v_s.ruleset = 'rally_rank' then
    if not rr_valid_score(case when p_winner = 'a' then p_score_a else p_score_b end,
                          case when p_winner = 'a' then p_score_b else p_score_a end, p_finish) then
      raise exception 'That score is not valid. Games go to 21, win by 2, up to 30. Use "Time called" for a shortened game.';
    end if;
  elsif p_score_a is not null and p_score_b is not null
        and (case when p_winner = 'a' then p_score_a - p_score_b else p_score_b - p_score_a end) <= 0 then
    -- Casual sessions: score optional, but it must agree with the winner.
    raise exception 'The winning side needs the higher score.';
  end if;

  update game_matches
     set winner = p_winner, score_a = p_score_a, score_b = p_score_b,
         finish = case when p_score_a is null then null else p_finish end,
         status = 'done', finished_at = coalesce(finished_at, v_now)
   where id = p_match;

  if v_m.status = 'playing' then
    update game_session_players set waiting_since = v_now
     where session_id = v_m.session_id and player_id = any(v_m.team_a || v_m.team_b);
  end if;

  if v_s.ruleset = 'rally_rank' then perform rr_replay_ratings(); end if;
end $$;
revoke all on function public.rr_record_result(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.rr_record_result(uuid, text, integer, integer, text) to authenticated;

-- Void a game (live or finished): no result, ratings replayed ----------------------
create or replace function public.rr_void_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_m game_matches%rowtype; v_s game_sessions%rowtype;
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into v_m from game_matches where id = p_match for update;
  if not found then raise exception 'Game not found'; end if;
  select * into v_s from game_sessions where id = v_m.session_id;
  if v_s.status = 'finalized' then raise exception 'This event is finalized. Reopen it to change results.'; end if;
  update game_matches set status = 'void', finished_at = coalesce(finished_at, now()) where id = p_match;
  if v_s.ruleset = 'rally_rank' and v_m.status = 'done' then perform rr_replay_ratings(); end if;
end $$;
revoke all on function public.rr_void_match(uuid) from public, anon;
grant execute on function public.rr_void_match(uuid) to authenticated;

-- Per player per event: N, W, point diff, LP (live for open events) ----------------
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
  where gs.ruleset = 'rally_rank';
revoke all on public.rr_event_player from public, anon;
grant select on public.rr_event_player to authenticated;

-- Player status: finalized events, provisional until 2 ------------------------------
create or replace view public.rr_player_status
with (security_invoker = false) as
  select p.id as player_id, p.rating,
         coalesce(f.events, 0)::int as finalized_events,
         coalesce(f.events, 0) < 2 as provisional
  from game_players p
  left join (
    select player_id, count(*) as events from rr_event_player where status = 'finalized' and n > 0 group by player_id
  ) f on f.player_id = p.id;
revoke all on public.rr_player_status from public, anon;
grant select on public.rr_player_status to authenticated;

-- Finalize / reopen -----------------------------------------------------------------
create or replace function public.rr_finalize_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_s game_sessions%rowtype; v_first text; v_second text;
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into v_s from game_sessions where id = p_session for update;
  if not found then raise exception 'Session not found'; end if;
  if v_s.ruleset <> 'rally_rank' then raise exception 'Only Rally & Rank events are finalized.'; end if;
  if v_s.status = 'finalized' then return; end if;
  if exists (select 1 from game_matches where session_id = p_session and status = 'playing') then
    raise exception 'Finish or cancel the games still on court first.';
  end if;
  delete from game_matches where session_id = p_session and status = 'queued';
  update game_session_players set bonus = 0 where session_id = p_session;

  if v_s.format = 'team' then
    -- Squad standings: win rate, then head-to-head among tied squads, then point diff per game, then wins.
    with sg as (
      select gm.id, gm.winner, gm.score_a, gm.score_b,
             (select max(squad) from game_session_players r where r.session_id = p_session and r.player_id = any(gm.team_a)) as sa,
             (select max(squad) from game_session_players r where r.session_id = p_session and r.player_id = any(gm.team_b)) as sb
      from game_matches gm where gm.session_id = p_session and gm.status = 'done' and gm.winner is not null
    ),
    per as (
      select squad, count(*) as g, sum(won) as w, sum(pd) as pd from (
        select sa as squad, case when winner = 'a' then 1 else 0 end as won, score_a - score_b as pd from sg where sa is not null and sa <> sb
        union all
        select sb, case when winner = 'b' then 1 else 0 end, score_b - score_a from sg where sb is not null and sa <> sb
      ) x group by squad
    ),
    rated as (select squad, g, w, pd, w::numeric / nullif(g, 0) as wr from per where g > 0),
    h2h as (
      select r1.squad,
             coalesce(sum(case when (s.sa = r1.squad and s.winner = 'a') or (s.sb = r1.squad and s.winner = 'b') then 1 else 0 end)::numeric
                      / nullif(count(s.id), 0), 0) as h
      from rated r1
      left join sg s on (s.sa = r1.squad or s.sb = r1.squad)
        and (case when s.sa = r1.squad then s.sb else s.sa end) in (select r2.squad from rated r2 where r2.wr = r1.wr and r2.squad <> r1.squad)
      group by r1.squad
    ),
    ordered as (
      select r.squad, row_number() over (order by r.wr desc, h.h desc, r.pd::numeric / r.g desc, r.w desc, md5(p_session::text || r.squad)) as place
      from rated r join h2h h using (squad)
    )
    select max(squad) filter (where place = 1), max(squad) filter (where place = 2) into v_first, v_second from ordered;

    update game_session_players r
       set bonus = case r.squad when v_first then 10 when v_second then 5 else 0 end
     where r.session_id = p_session and r.squad in (v_first, v_second)
       and exists (select 1 from game_matches gm where gm.session_id = p_session and gm.status = 'done'
                   and r.player_id = any(gm.team_a || gm.team_b));
  end if;

  update game_sessions set status = 'finalized', finalized_at = now(), finalized_by = auth.uid(),
         closed_at = coalesce(closed_at, now())
   where id = p_session;
end $$;
revoke all on function public.rr_finalize_session(uuid) from public, anon;
grant execute on function public.rr_finalize_session(uuid) to authenticated;

create or replace function public.rr_reopen_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.current_user_role()::text, '') not in ('owner', 'partner') then
    raise exception 'Only an owner or partner can reopen a finalized event.' using errcode = '42501';
  end if;
  update game_session_players set bonus = 0 where session_id = p_session;
  -- Back to open so staff can correct results, then finalize again.
  update game_sessions set status = 'open', finalized_at = null, finalized_by = null, closed_at = null
   where id = p_session and status = 'finalized';
end $$;
revoke all on function public.rr_reopen_session(uuid) from public, anon;
grant execute on function public.rr_reopen_session(uuid) to authenticated;

-- Public views (names as "First L.", rating 2 dp, no divisions) --------------------
create or replace function public.rr_public_name(n text) returns text
language sql immutable as $$
  select case when trim(n) ~ '\s'
              then split_part(trim(n), ' ', 1) || ' ' || upper(left(substring(trim(n) from '\S+$'), 1)) || '.'
              else trim(n) end
$$;

create or replace view public.web_rr_event
with (security_invoker = false) as
  select e.session_id, e.sport, e.format, e.session_date, e.season,
         ev.name as event_name,
         (e.status = 'finalized') as final,
         row_number() over (
           partition by e.session_id
           order by e.lp desc, (e.w::numeric / nullif(e.n, 0)) desc nulls last, e.w desc, e.n desc,
                    (e.pd::numeric / nullif(e.n, 0)) desc nulls last, e.player_id
         )::int as rank,
         e.player_id, public.rr_public_name(p.display_name) as name,
         round(p.rating, 2) as rating, s.provisional,
         e.lp, e.n as matches, e.w as wins, e.n - e.w as losses,
         case when e.n > 0 then round(100 * e.w::numeric / e.n, 1) end as win_rate,
         (e.n > 0 and e.n < 4) as prorated, e.squad, e.bonus
  from rr_event_player e
  join game_sessions gs on gs.id = e.session_id
  left join events ev on ev.id = gs.event_id
  join game_players p on p.id = e.player_id
  join rr_player_status s on s.player_id = e.player_id;
revoke all on public.web_rr_event from public;
grant select on public.web_rr_event to anon, authenticated;

create or replace view public.web_rr_season
with (security_invoker = false) as
  with agg as (
    select sport, season, player_id, sum(lp)::numeric(12,2) as lp, sum(n)::int as matches, sum(w)::int as wins,
           sum(pd)::int as pd, count(*) filter (where n > 0)::int as events
    from rr_event_player
    where status = 'finalized' and season is not null and n > 0
    group by sport, season, player_id
  )
  select a.sport, a.season,
         row_number() over (
           partition by a.sport, a.season
           order by a.lp desc, a.wins desc, (a.wins::numeric / a.matches) desc, a.events desc,
                    (a.pd::numeric / a.matches) desc, a.player_id
         )::int as rank,
         a.player_id, public.rr_public_name(p.display_name) as name,
         round(p.rating, 2) as rating, s.provisional,
         a.lp, a.matches, a.wins, a.matches - a.wins as losses,
         round(100 * a.wins::numeric / a.matches, 1) as win_rate,
         a.events, (a.events >= 4 and a.matches >= 16) as eligible
  from agg a
  join game_players p on p.id = a.player_id
  join rr_player_status s on s.player_id = a.player_id;
revoke all on public.web_rr_season from public;
grant select on public.web_rr_season to anon, authenticated;

-- The signed-in member's own season standings (matched by verified email) ----------
drop function if exists public.member_standings();
create function public.member_standings()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'sport', l.sport, 'season', l.season, 'rank', l.rank, 'lp', l.lp, 'wins', l.wins,
           'matches', l.matches, 'events', l.events, 'rating', l.rating, 'provisional', l.provisional,
           'of', (select count(*) from web_rr_season x where x.sport = l.sport and x.season = l.season))
         order by l.season desc, l.sport), '[]'::jsonb)
  from web_rr_season l
  join game_players p on p.id = l.player_id
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
  where p.email is not null and lower(p.email) = lower(u.email)
$$;
revoke all on function public.member_standings() from public, anon;
grant execute on function public.member_standings() to authenticated;

-- Let signed-in customers read the new public views through the member wall.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.check_request()'::regprocedure);
  if position('web_rr_season' in v_def) = 0 then
    v_def := replace(v_def, $a$'web_leaderboard',$a$, $b$'web_leaderboard', 'web_rr_season', 'web_rr_event',$b$);
    if position('web_rr_season' in v_def) = 0 then
      raise exception 'check_request allow-list not found; nothing changed';
    end if;
    execute v_def;
  end if;
end $$;
