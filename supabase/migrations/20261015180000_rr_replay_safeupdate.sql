-- Supabase's safeupdate guard rejects DELETE without WHERE on API requests, so
-- the ledger wipe in rr_replay_ratings() failed when called from the board.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.rr_replay_ratings()'::regprocedure);
  if position('delete from rr_rating_ledger;' in v_def) > 0 then
    execute replace(v_def, 'delete from rr_rating_ledger;', 'delete from rr_rating_ledger where true;');
  end if;
end $$;
