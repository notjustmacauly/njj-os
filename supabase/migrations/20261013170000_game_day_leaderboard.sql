-- =================================================================
-- Game day + community leaderboard (replaces CourtBoss for scoring).
--
--  game_players          everyone who has played. email (lowercase) links a
--                        player to pass holders and member accounts.
--  game_sessions         one per sport per event night (courts, team size).
--  game_session_players  today's roster + queue position (waiting_since).
--  game_matches          one row per game on a court (teams, score, winner).
--
--  Points: win 3, loss 1, +2 per session played. Seasons = calendar quarters.
--  web_leaderboard       public, names shown as "First L.".
--  member_standings()    the signed-in member's own rank per sport.
--
-- Staff (any OS role) run game day; the public only sees the leaderboard view.
-- =================================================================

create table if not exists public.game_players (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  email        text,
  skill_level  text not null default 'intermediate'
                 check (skill_level in ('beginner','intermediate','advanced','pro')),
  rating       numeric(4,2) not null default 3.50 check (rating between 1 and 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists game_players_email_key on public.game_players (lower(email)) where email is not null;

create table if not exists public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references public.events(id),
  sport       text not null check (sport in ('badminton','pickleball','volleyball')),
  session_date date not null default (now() at time zone 'Asia/Manila')::date,
  courts      integer not null default 2 check (courts between 1 and 8),
  team_size   integer not null default 2 check (team_size between 1 and 6),
  status      text not null default 'open' check (status in ('open','closed')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists game_sessions_date_idx on public.game_sessions (session_date desc);

create table if not exists public.game_session_players (
  session_id     uuid not null references public.game_sessions(id) on delete cascade,
  player_id      uuid not null references public.game_players(id),
  active         boolean not null default true,       -- false = benched / gone home
  waiting_since  timestamptz not null default now(),  -- queue order (oldest first)
  joined_at      timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table if not exists public.game_matches (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.game_sessions(id) on delete cascade,
  court       integer not null,
  team_a      uuid[] not null,
  team_b      uuid[] not null,
  score_a     integer check (score_a >= 0),
  score_b     integer check (score_b >= 0),
  winner      text check (winner in ('a','b')),
  status      text not null default 'playing' check (status in ('playing','done','void')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists game_matches_session_idx on public.game_matches (session_id, status);
-- One live game per court at a time.
create unique index if not exists game_matches_one_live_per_court
  on public.game_matches (session_id, court) where status = 'playing';

-- RLS: any staff role runs game day; nobody else touches the raw tables.
do $$
declare t text;
begin
  foreach t in array array['game_players','game_sessions','game_session_players','game_matches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.current_user_role() in (''owner'',''partner'',''manager'',''staff''))
         with check (public.current_user_role() in (''owner'',''partner'',''manager'',''staff''))',
      t || '_staff', t);
  end loop;
end $$;

-- Per-player per-season points ------------------------------------------------
-- Definer view (owner reads the raw tables); only staff and the definer
-- leaderboard below can select from it.
create or replace view public.game_season_points
with (security_invoker = false) as
  with results as (
    select gs.sport, gs.id as session_id,
           (extract(year from gs.session_date)::int * 10 + extract(quarter from gs.session_date)::int) as season_key,
           p.player_id,
           case when (m.winner = 'a' and p.player_id = any(m.team_a)) or (m.winner = 'b' and p.player_id = any(m.team_b))
                then 1 else 0 end as won
    from public.game_matches m
    join public.game_sessions gs on gs.id = m.session_id
    cross join lateral unnest(m.team_a || m.team_b) as p(player_id)
    where m.status = 'done' and m.winner is not null
  )
  select sport, season_key, player_id,
         count(*)::int as games,
         sum(won)::int as wins,
         (count(*) - sum(won))::int as losses,
         count(distinct session_id)::int as sessions,
         (sum(won) * 3 + (count(*) - sum(won)) * 1 + count(distinct session_id) * 2)::int as points
  from results
  group by sport, season_key, player_id;

-- Public leaderboard (definer view: exposes names as "First L." only) --------------
create or replace view public.web_leaderboard
with (security_invoker = false) as
  with seasons as (
    select sport, season_key, player_id, games, wins, losses, sessions, points from public.game_season_points
    union all
    select sport, 0 as season_key, player_id, sum(games)::int, sum(wins)::int, sum(losses)::int,
           sum(sessions)::int, sum(points)::int
    from public.game_season_points group by sport, player_id
  )
  select s.sport, s.season_key,
         rank() over (partition by s.sport, s.season_key order by s.points desc, s.wins desc, s.games asc)::int as rank,
         s.player_id,
         case when trim(p.display_name) ~ '\s'
              then split_part(trim(p.display_name), ' ', 1) || ' ' || upper(left(substring(trim(p.display_name) from '\S+$'), 1)) || '.'
              else trim(p.display_name) end as name,
         s.points, s.wins, s.losses, s.games, s.sessions
  from seasons s
  join public.game_players p on p.id = s.player_id;

revoke all on public.web_leaderboard from public;
grant select on public.web_leaderboard to anon, authenticated;
revoke all on public.game_season_points from public, anon;
grant select on public.game_season_points to authenticated;

-- The signed-in member's own standings (matched by verified email) ------------------
create or replace function public.member_standings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'sport', l.sport, 'season_key', l.season_key, 'rank', l.rank,
           'points', l.points, 'wins', l.wins, 'losses', l.losses, 'games', l.games, 'sessions', l.sessions,
           'of', (select count(*) from public.web_leaderboard x where x.sport = l.sport and x.season_key = l.season_key))
         order by l.sport, l.season_key desc), '[]'::jsonb)
  from public.web_leaderboard l
  join public.game_players p on p.id = l.player_id
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
  where p.email is not null and lower(p.email) = lower(u.email)
$$;
revoke all on function public.member_standings() from public, anon;
grant execute on function public.member_standings() to authenticated;

-- Let signed-in customers read the leaderboard + their standings through the wall.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.check_request()'::regprocedure);
  if position('web_leaderboard' in v_def) = 0 then
    v_def := replace(v_def, $a$'web_catalog', 'web_flavors', 'web_events', 'venues',$a$,
                            $b$'web_catalog', 'web_flavors', 'web_events', 'venues', 'web_leaderboard', 'rpc/member_standings',$b$);
    if position('web_leaderboard' in v_def) = 0 then
      raise exception 'check_request allow-list not found; nothing changed';
    end if;
    execute v_def;
  end if;
end $$;
