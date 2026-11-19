-- Badminton Game Day: one shared "Up next" list instead of a queue per court.
-- Waiting lineups are game_matches with status 'queued' and court 0; the first
-- one goes onto whichever court frees up. Drop the one-queued-per-court rule.
drop index if exists public.game_matches_one_queued_per_court;
update public.game_matches set court = 0 where status = 'queued';
