-- Rally & Rank: choose games to 21 or 31 per session (win by 2, capped at
-- target + 9: 30 or 40).
alter table public.game_sessions add column if not exists target_points integer not null default 21;
alter table public.game_sessions drop constraint if exists game_sessions_target_points_check;
alter table public.game_sessions add constraint game_sessions_target_points_check check (target_points in (21, 31));

create or replace function public.rr_valid_score(w integer, l integer, p_finish text, p_target integer) returns boolean
language sql immutable as $$
  select w is not null and l is not null and w > l and l >= 0 and w <= p_target + 9 and case p_finish
    when 'target' then (w = p_target and l <= p_target - 2)
                    or (w between p_target + 1 and p_target + 9 and l = w - 2)
                    or (w = p_target + 9 and l = p_target + 8)
    when 'timed' then true
    else false end
$$;

-- rr_record_result: validate against the session's target.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.rr_record_result(uuid, text, integer, integer, text)'::regprocedure);
  v_def := replace(v_def,
    $a$case when p_winner = 'a' then p_score_b else p_score_a end, p_finish) then$a$,
    $b$case when p_winner = 'a' then p_score_b else p_score_a end, p_finish, coalesce(v_s.target_points, 21)) then$b$);
  v_def := replace(v_def,
    $a$'That score is not valid. Games go to 21, win by 2, up to 30. Use "Time called" for a shortened game.'$a$,
    $b$'That score is not valid. Games go to %, win by 2, up to %. Use "Time called" for a shortened game.', coalesce(v_s.target_points, 21), coalesce(v_s.target_points, 21) + 9$b$);
  if position('coalesce(v_s.target_points, 21)) then' in v_def) = 0 then
    raise exception 'rr_record_result score check not found; nothing changed';
  end if;
  execute v_def;
end $$;
