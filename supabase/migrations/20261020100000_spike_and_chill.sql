-- =================================================================
-- Spike & Chill Volleyball 2.0 (docs/specs/SPIKE_AND_CHILL_VOLLEYBALL_2_SPEC.txt)
--
--  Night      28 players, four teams of 7 (6 on court + rolling sub), one court,
--             12 fixed games: two round robins (A-D, then reshuffled E-H).
--  Results    PLAYED: one side 21, other 0-20 (21-20 valid, no win by two).
--             TIMED (emergency only, no clock by default): both 0-20, higher
--             wins, equal draws. FORFEIT: W/L + LP for the present roster, no
--             rating. NO_CONTEST: nothing counts.
--  Rating     Volleyball only (game_sport_ratings), 1.00-5.00, expected
--             1/(1+10^(opp-own)), K 0.16 for a player's first 5 rated games
--             then 0.08, draw = 0.5. Seeded from the level staff pick.
--  LP         20 + 80 x (W + D/2) / N, no minimum games; Team Night +5 per
--             unique block win; Rivalry +5 win / +2.5 draw on the designated
--             game; Double Points x2; capped at 100 per event.
-- Ratings are rebuilt by replaying every verified game in schedule order.
-- =================================================================

-- Rulesets / sizes ------------------------------------------------------------------
alter table public.game_sessions drop constraint if exists game_sessions_ruleset_check;
alter table public.game_sessions add constraint game_sessions_ruleset_check check (ruleset in ('casual', 'rally_rank', 'spike_chill'));
alter table public.game_sessions drop constraint if exists game_sessions_team_size_check;
alter table public.game_sessions add constraint game_sessions_team_size_check check (team_size between 1 and 8);
alter table public.game_sessions add column if not exists rivalry_games integer[] not null default '{1,2}';

alter table public.game_templates drop constraint if exists game_templates_ruleset_check;
alter table public.game_templates add constraint game_templates_ruleset_check check (ruleset in ('casual', 'rally_rank', 'spike_chill'));
alter table public.game_templates drop constraint if exists game_templates_team_size_check;
alter table public.game_templates add constraint game_templates_team_size_check check (team_size between 1 and 8);

-- Roster: team per block ------------------------------------------------------------
alter table public.game_session_players
  add column if not exists block1_team text,
  add column if not exists block2_team text;
alter table public.game_session_players drop constraint if exists game_session_players_block1_check;
alter table public.game_session_players add constraint game_session_players_block1_check check (block1_team is null or block1_team in ('A', 'B', 'C', 'D'));
alter table public.game_session_players drop constraint if exists game_session_players_block2_check;
alter table public.game_session_players add constraint game_session_players_block2_check check (block2_team is null or block2_team in ('E', 'F', 'G', 'H'));

-- Matches: fixed schedule slots and outcome type -----------------------------------
alter table public.game_matches
  add column if not exists game_no integer,
  add column if not exists block smallint,
  add column if not exists label_a text,
  add column if not exists label_b text,
  add column if not exists outcome text,
  add column if not exists is_draw boolean not null default false;
alter table public.game_matches drop constraint if exists game_matches_outcome_check;
alter table public.game_matches add constraint game_matches_outcome_check check (outcome is null or outcome in ('played', 'timed', 'forfeit', 'no_contest'));
alter table public.game_matches drop constraint if exists game_matches_status_check;
alter table public.game_matches add constraint game_matches_status_check check (status in ('scheduled', 'queued', 'playing', 'done', 'void'));
create unique index if not exists game_matches_game_no_key on public.game_matches (session_id, game_no) where game_no is not null;

-- Per-sport rating (volleyball first; badminton stays on game_players) -------------
create table if not exists public.game_sport_ratings (
  player_id    uuid not null references public.game_players(id) on delete cascade,
  sport        text not null check (sport in ('badminton', 'pickleball', 'volleyball')),
  level        text,
  seed_rating  numeric(9,6),
  rating       numeric(9,6) not null,
  rated_count  integer not null default 0,
  tags         text[] not null default '{}',
  seeded_at    timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (player_id, sport),
  check (rating between 1 and 6),
  check (tags <@ array['setter', 'middle', 'outside', 'opposite', 'defensive', 'unknown']::text[])
);
alter table public.game_sport_ratings enable row level security;
drop policy if exists game_sport_ratings_staff on public.game_sport_ratings;
create policy game_sport_ratings_staff on public.game_sport_ratings for all to authenticated
  using (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'))
  with check (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'));

create table if not exists public.vb_rating_ledger (
  match_id     uuid not null references public.game_matches(id) on delete cascade,
  player_id    uuid not null references public.game_players(id) on delete cascade,
  seq          integer not null,
  prior        numeric(9,6) not null,
  rated_before integer not null,
  k            numeric(4,2) not null,
  expected     numeric(12,9) not null,
  result       numeric(2,1) not null,
  new_rating   numeric(9,6) not null,
  primary key (match_id, player_id)
);
alter table public.vb_rating_ledger enable row level security;
drop policy if exists vb_rating_ledger_staff on public.vb_rating_ledger;
create policy vb_rating_ledger_staff on public.vb_rating_ledger for select to authenticated
  using (coalesce(public.current_user_role()::text, '') in ('owner', 'partner', 'manager', 'staff'));

-- Replay every verified volleyball game in schedule order --------------------------
create or replace function public.vb_replay_ratings() returns void
language plpgsql security definer set search_path = public as $$
declare
  m record; ra numeric; rb numeric; ea numeric; sa numeric; v_seq integer := 0;
begin
  drop table if exists pg_temp.vb_r;
  create temp table vb_r (id uuid primary key, r numeric, n integer) on commit drop;
  insert into vb_r select player_id, coalesce(seed_rating, 3.0), 0 from game_sport_ratings where sport = 'volleyball';
  -- Anyone who played without a rating row starts at 3.00.
  insert into vb_r
    select distinct p.pid, 3.0, 0
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'spike_chill'
    cross join lateral unnest(gm.team_a || gm.team_b) as p(pid)
  on conflict (id) do nothing;

  delete from vb_rating_ledger where true;

  for m in
    select gm.id, gm.team_a, gm.team_b, gm.winner, gm.is_draw
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'spike_chill' and gs.status <> 'cancelled'
    where gm.status = 'done' and gm.outcome in ('played', 'timed')
      and cardinality(gm.team_a) > 0 and cardinality(gm.team_b) > 0
    order by gs.session_date, gs.created_at, gs.id, gm.game_no, gm.id
  loop
    v_seq := v_seq + 1;
    select avg(r) into ra from vb_r where id = any(m.team_a);
    select avg(r) into rb from vb_r where id = any(m.team_b);
    ea := 1 / (1 + power(10::numeric, rb - ra));
    sa := case when m.is_draw then 0.5 when m.winner = 'a' then 1 else 0 end;
    insert into vb_rating_ledger (match_id, player_id, seq, prior, rated_before, k, expected, result, new_rating)
    select m.id, t.pid, v_seq, round(r.r, 6), r.n, k.k, round(t.e, 9), t.s,
           round(least(5, greatest(1, r.r + k.k * (t.s - t.e))), 6)
    from (
      select unnest(m.team_a) as pid, ea as e, sa as s
      union all
      select unnest(m.team_b), 1 - ea, 1 - sa
    ) t
    join vb_r r on r.id = t.pid
    cross join lateral (select (case when r.n < 5 then 0.16 else 0.08 end)::numeric(4,2) as k) k;
    update vb_r set r = l.new_rating, n = n + 1 from vb_rating_ledger l where l.match_id = m.id and l.player_id = vb_r.id;
  end loop;

  update game_sport_ratings g set rating = round(r.r, 6), rated_count = r.n, updated_at = now()
  from vb_r r where g.sport = 'volleyball' and g.player_id = r.id
    and (g.rating is distinct from round(r.r, 6) or g.rated_count <> r.n);
end $$;
revoke all on function public.vb_replay_ratings() from public, anon, authenticated;

-- Record (or correct) a result ------------------------------------------------------
create or replace function public.vb_record_result(p_match uuid, p_outcome text, p_score_a integer, p_score_b integer, p_winner text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m game_matches%rowtype; v_s game_sessions%rowtype; v_draw boolean := false; v_win text := p_winner;
  v_a uuid[]; v_b uuid[];
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into v_m from game_matches where id = p_match for update;
  if not found then raise exception 'Game not found'; end if;
  select * into v_s from game_sessions where id = v_m.session_id;
  if v_s.ruleset <> 'spike_chill' then raise exception 'Not a Spike & Chill game.'; end if;
  if v_s.status <> 'open' then raise exception 'This event is not open. Reopen it to change results.'; end if;
  if v_m.status not in ('scheduled', 'playing', 'done') then raise exception 'That game cannot take a result.'; end if;

  if p_outcome = 'played' then
    if not ((p_score_a = 21 and p_score_b between 0 and 20) or (p_score_b = 21 and p_score_a between 0 and 20)) then
      raise exception 'A finished game needs exactly one side on 21 and the other between 0 and 20 (21-20 is fine).';
    end if;
    v_win := case when p_score_a = 21 then 'a' else 'b' end;
  elsif p_outcome = 'timed' then
    if p_score_a is null or p_score_b is null or p_score_a not between 0 and 20 or p_score_b not between 0 and 20 then
      raise exception 'Time called: both scores must be between 0 and 20.';
    end if;
    if p_score_a = 0 and p_score_b = 0 then raise exception 'No rally was completed. Record it as no contest.'; end if;
    v_draw := p_score_a = p_score_b;
    v_win := case when v_draw then null when p_score_a > p_score_b then 'a' else 'b' end;
  elsif p_outcome = 'forfeit' then
    if p_winner not in ('a', 'b') then raise exception 'Pick the team that wins by forfeit.'; end if;
  elsif p_outcome = 'no_contest' then
    v_win := null;
  else
    raise exception 'Unknown result type.';
  end if;

  -- Credit the present roster if the game never started on the board.
  v_a := v_m.team_a; v_b := v_m.team_b;
  if cardinality(v_a) = 0 then
    select coalesce(array_agg(player_id), '{}') into v_a from game_session_players
     where session_id = v_m.session_id and active
       and (case when v_m.block = 2 then block2_team else block1_team end) = v_m.label_a;
  end if;
  if cardinality(v_b) = 0 then
    select coalesce(array_agg(player_id), '{}') into v_b from game_session_players
     where session_id = v_m.session_id and active
       and (case when v_m.block = 2 then block2_team else block1_team end) = v_m.label_b;
  end if;

  update game_matches
     set outcome = p_outcome, is_draw = v_draw, winner = v_win,
         score_a = case when p_outcome in ('played', 'timed') then p_score_a end,
         score_b = case when p_outcome in ('played', 'timed') then p_score_b end,
         finish = case p_outcome when 'played' then 'target' when 'timed' then 'timed' end,
         team_a = case when p_outcome = 'no_contest' then team_a else v_a end,
         team_b = case when p_outcome = 'no_contest' then team_b else v_b end,
         status = 'done', finished_at = coalesce(finished_at, now())
   where id = p_match;

  perform vb_replay_ratings();
end $$;
revoke all on function public.vb_record_result(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.vb_record_result(uuid, text, integer, integer, text) to authenticated;

-- Put a result back to "not played yet" (mistake) ------------------------------------
create or replace function public.vb_clear_result(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_s game_sessions%rowtype;
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select gs.* into v_s from game_sessions gs join game_matches gm on gm.session_id = gs.id where gm.id = p_match;
  if v_s.status <> 'open' then raise exception 'This event is not open.'; end if;
  update game_matches set status = 'scheduled', outcome = null, is_draw = false, winner = null, score_a = null, score_b = null,
         finish = null, team_a = '{}', team_b = '{}', finished_at = null
   where id = p_match;
  perform vb_replay_ratings();
end $$;
revoke all on function public.vb_clear_result(uuid) from public, anon;
grant execute on function public.vb_clear_result(uuid) to authenticated;

-- Per player per event --------------------------------------------------------------
create or replace view public.vb_event_player
with (security_invoker = false) as
  with apps as (
    -- One row per credited appearance (played, timed, forfeit).
    select gm.session_id, gm.id as match_id, gm.game_no, gm.block, gm.outcome, p.pid as player_id,
           case when p.pid = any(gm.team_a) then 'a' else 'b' end as side,
           case when p.pid = any(gm.team_a) then gm.label_a else gm.label_b end as team,
           gm.is_draw,
           (not gm.is_draw and gm.winner = case when p.pid = any(gm.team_a) then 'a' else 'b' end) as won,
           case when gm.outcome in ('played', 'timed') then case when p.pid = any(gm.team_a) then gm.score_a else gm.score_b end end as pf,
           case when gm.outcome in ('played', 'timed') then case when p.pid = any(gm.team_a) then gm.score_b else gm.score_a end end as pa
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'spike_chill' and gs.status <> 'cancelled'
    cross join lateral unnest(gm.team_a || gm.team_b) as p(pid)
    where gm.status = 'done' and gm.outcome in ('played', 'timed', 'forfeit')
  ),
  -- Block table: 2 for a win, 1 for a draw (forfeits included); unique leader only.
  tbl as (
    select gm.session_id, gm.block, x.label, sum(x.pts) as pts
    from game_matches gm
    join game_sessions gs on gs.id = gm.session_id and gs.ruleset = 'spike_chill'
    cross join lateral (values
      (gm.label_a, case when gm.is_draw then 1 when gm.winner = 'a' then 2 else 0 end),
      (gm.label_b, case when gm.is_draw then 1 when gm.winner = 'b' then 2 else 0 end)
    ) x(label, pts)
    where gm.status = 'done' and gm.outcome in ('played', 'timed', 'forfeit')
    group by gm.session_id, gm.block, x.label
  ),
  leaders as (
    select session_id, block, (array_agg(label order by pts desc))[1] as label
    from tbl t
    where pts = (select max(pts) from tbl t2 where t2.session_id = t.session_id and t2.block = t.block)
    group by session_id, block
    having count(*) = 1
  ),
  agg as (
    select a.session_id, a.player_id,
           count(*)::int as n,
           count(*) filter (where a.won)::int as w,
           count(*) filter (where a.is_draw)::int as d,
           count(*) filter (where not a.won and not a.is_draw)::int as l,
           coalesce(sum(a.pf), 0)::int as pf, coalesce(sum(a.pa), 0)::int as pa,
           count(*) filter (where a.outcome = 'timed')::int as timed,
           count(*) filter (where a.outcome = 'forfeit' and a.won)::int as forfeit_w,
           count(*) filter (where a.outcome = 'forfeit' and not a.won)::int as forfeit_l,
           max(a.team) filter (where a.block = 1) as team1,
           max(a.team) filter (where a.block = 2) as team2,
           (select count(distinct a2.block) from apps a2 join leaders ld on ld.session_id = a2.session_id and ld.block = a2.block and ld.label = a2.team
             where a2.session_id = a.session_id and a2.player_id = a.player_id)::int as blocks_won
    from apps a group by a.session_id, a.player_id
  ),
  rival as (
    -- The player's first designated rivalry game.
    select distinct on (a.session_id, a.player_id) a.session_id, a.player_id,
           case when a.won then 5 when a.is_draw then 2.5 else 0 end::numeric as bonus
    from apps a join game_sessions gs on gs.id = a.session_id
    where a.game_no = any(gs.rivalry_games)
    order by a.session_id, a.player_id, a.game_no
  ),
  rating as (
    select gm.session_id, l.player_id,
           (array_agg(l.prior order by l.seq))[1] as rating_before,
           (array_agg(l.new_rating order by l.seq desc))[1] as rating_after
    from vb_rating_ledger l join game_matches gm on gm.id = l.match_id
    group by gm.session_id, l.player_id
  )
  select gs.id as session_id, gs.sport, gs.format, gs.session_date, gs.status, gs.title,
         public.rr_season_of(gs.session_date) as season,
         r.player_id,
         coalesce(a.n, 0) as n, coalesce(a.w, 0) as w, coalesce(a.d, 0) as d, coalesce(a.l, 0) as l,
         coalesce(a.pf, 0) as pf, coalesce(a.pa, 0) as pa,
         coalesce(a.timed, 0) as timed, coalesce(a.forfeit_w, 0) as forfeit_w, coalesce(a.forfeit_l, 0) as forfeit_l,
         coalesce(a.team1, r.block1_team) as team1, coalesce(a.team2, r.block2_team) as team2,
         case when gs.format = 'team' then 5 * coalesce(a.blocks_won, 0) else 0 end::numeric as team_bonus,
         case when gs.format = 'rivalry' then coalesce(rv.bonus, 0) else 0 end::numeric as rivalry_bonus,
         case when coalesce(a.n, 0) = 0 then 0::numeric(12,2)
              else round(least(100::numeric,
                     (case when gs.format = 'double' then 2 else 1 end)
                     * (20 + 80 * (a.w + 0.5 * a.d)::numeric / a.n
                        + case when gs.format = 'team' then 5 * coalesce(a.blocks_won, 0) else 0 end
                        + case when gs.format = 'rivalry' then coalesce(rv.bonus, 0) else 0 end)), 2)
         end::numeric(12,2) as lp,
         rt.rating_before, rt.rating_after
  from game_sessions gs
  join game_session_players r on r.session_id = gs.id
  left join agg a on a.session_id = gs.id and a.player_id = r.player_id
  left join rival rv on rv.session_id = gs.id and rv.player_id = r.player_id
  left join rating rt on rt.session_id = gs.id and rt.player_id = r.player_id
  where gs.ruleset = 'spike_chill' and gs.status <> 'cancelled';
revoke all on public.vb_event_player from public, anon;
grant select on public.vb_event_player to authenticated;

-- Public views ------------------------------------------------------------------------
create or replace view public.web_vb_event
with (security_invoker = false) as
  select e.session_id, e.sport, e.format, e.session_date, e.season,
         coalesce(ev.name, e.title) as event_name,
         (e.status = 'finalized') as final,
         row_number() over (
           partition by e.session_id
           order by e.lp desc, e.w desc, (e.w::numeric / nullif(e.n, 0)) desc nulls last, e.player_id
         )::int as rank,
         e.player_id, public.rr_public_name(p.display_name) as name,
         round(coalesce(e.rating_before, sr.rating), 3) as rating_before,
         round(coalesce(e.rating_after, sr.rating), 3) as rating_after,
         round(coalesce(e.rating_after - e.rating_before, 0), 3) as rating_change,
         (coalesce(sr.rated_count, 0) < 5) as provisional,
         e.lp, e.n as matches, e.w as wins, e.l as losses, e.d as draws,
         case when e.n > 0 then round(100 * e.w::numeric / e.n, 1) end as win_rate,
         e.pf as points_for, e.pa as points_against, e.pf - e.pa as point_diff,
         e.timed, e.forfeit_w, e.forfeit_l, e.team1, e.team2,
         e.team_bonus + e.rivalry_bonus as bonus
  from vb_event_player e
  join game_sessions gs on gs.id = e.session_id
  left join events ev on ev.id = gs.event_id
  join game_players p on p.id = e.player_id
  left join game_sport_ratings sr on sr.player_id = e.player_id and sr.sport = 'volleyball';
revoke all on public.web_vb_event from public;
grant select on public.web_vb_event to anon, authenticated;

create or replace view public.web_vb_season
with (security_invoker = false) as
  with agg as (
    select season, player_id, sum(lp)::numeric(12,2) as lp, sum(n)::int as matches, sum(w)::int as wins,
           sum(d)::int as draws, sum(l)::int as losses, count(*) filter (where n > 0)::int as events
    from vb_event_player
    where status = 'finalized' and season is not null and n > 0
    group by season, player_id
  )
  select 'volleyball'::text as sport, a.season,
         row_number() over (
           partition by a.season
           order by a.lp desc, a.wins desc, (a.wins::numeric / a.matches) desc, a.player_id
         )::int as rank,
         a.player_id, public.rr_public_name(p.display_name) as name,
         round(coalesce(sr.rating, 3), 3) as rating, (coalesce(sr.rated_count, 0) < 5) as provisional,
         a.lp, a.matches, a.wins, a.draws, a.losses,
         round(100 * a.wins::numeric / a.matches, 1) as win_rate,
         a.events
  from agg a
  join game_players p on p.id = a.player_id
  left join game_sport_ratings sr on sr.player_id = a.player_id and sr.sport = 'volleyball';
revoke all on public.web_vb_season from public;
grant select on public.web_vb_season to anon, authenticated;

-- Finalize: every scheduled game needs an outcome -----------------------------------
create or replace function public.vb_finalize_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_s game_sessions%rowtype; v_left integer;
begin
  if not rr_is_staff() then raise exception 'Staff only' using errcode = '42501'; end if;
  select * into v_s from game_sessions where id = p_session for update;
  if not found or v_s.ruleset <> 'spike_chill' then raise exception 'Not a Spike & Chill event.'; end if;
  if v_s.status = 'finalized' then return; end if;
  select count(*) into v_left from game_matches where session_id = p_session and game_no is not null and status <> 'done';
  if v_left > 0 then
    raise exception '% game(s) have no result yet. Enter them or mark them no contest.', v_left;
  end if;
  update game_sessions set status = 'finalized', finalized_at = now(), finalized_by = auth.uid(), closed_at = coalesce(closed_at, now())
   where id = p_session;
end $$;
revoke all on function public.vb_finalize_session(uuid) from public, anon;
grant execute on function public.vb_finalize_session(uuid) to authenticated;

-- Cancel: also replays volleyball ratings -------------------------------------------
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
  if v_s.ruleset = 'spike_chill' then perform vb_replay_ratings(); end if;
  return 'cancelled';
end $$;

-- Member standings across both sports ------------------------------------------------
drop function if exists public.member_standings();
create function public.member_standings()
returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select p.id from game_players p
    join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
    where p.email is not null and lower(p.email) = lower(u.email)
  ),
  standings as (
    select l.sport, l.season, l.rank, l.lp, l.wins, l.matches, l.events, l.rating, l.provisional,
           (select count(*) from web_rr_season x where x.sport = l.sport and x.season = l.season) as of
    from web_rr_season l where l.player_id in (select id from mine)
    union all
    select l.sport, l.season, l.rank, l.lp, l.wins, l.matches, l.events, l.rating, l.provisional,
           (select count(*) from web_vb_season x where x.season = l.season) as of
    from web_vb_season l where l.player_id in (select id from mine)
  )
  select coalesce(jsonb_agg(to_jsonb(standings) order by season desc, sport), '[]'::jsonb) from standings
$$;
revoke all on function public.member_standings() from public, anon;
grant execute on function public.member_standings() to authenticated;

-- Volleyball cards ---------------------------------------------------------------------
insert into public.game_templates (name, sport, ruleset, format, courts, team_size, blurb, sort)
select v.* from (values
  ('Spike & Chill', 'volleyball', 'spike_chill', 'classic', 1, 7, 'Four teams of 7, two round robins, reshuffle after game 6.', 11),
  ('Team Night',    'volleyball', 'spike_chill', 'team',    1, 7, 'Win your round outright for +5 LP, twice a night.', 12),
  ('Double Points', 'volleyball', 'spike_chill', 'double',  1, 7, 'Spike & Chill rules, LP doubled (still capped at 100).', 13),
  ('Rivalry Night', 'volleyball', 'spike_chill', 'rivalry', 1, 7, 'One designated rivalry game each: +5 for a win, +2.5 for a draw.', 14)
) v(name, sport, ruleset, format, courts, team_size, blurb, sort)
where not exists (select 1 from public.game_templates t where t.sport = 'volleyball');

-- Let signed-in customers read the volleyball views through the member wall.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.check_request()'::regprocedure);
  if position('web_vb_season' in v_def) = 0 then
    v_def := replace(v_def, $a$'web_rr_season',$a$, $b$'web_rr_season', 'web_vb_season', 'web_vb_event',$b$);
    if position('web_vb_season' in v_def) = 0 then
      raise exception 'check_request allow-list not found; nothing changed';
    end if;
    execute v_def;
  end if;
end $$;
