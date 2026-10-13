-- Game day v2: every court can hold its next lineup ("Next on Court 1") as a
-- game_matches row with status 'queued'. One queued + one playing per court.
-- The leaderboard only counts status = 'done', so queued rows never score.
alter table public.game_matches drop constraint if exists game_matches_status_check;
alter table public.game_matches add constraint game_matches_status_check
  check (status in ('queued', 'playing', 'done', 'void'));

create unique index if not exists game_matches_one_queued_per_court
  on public.game_matches (session_id, court) where status = 'queued';
