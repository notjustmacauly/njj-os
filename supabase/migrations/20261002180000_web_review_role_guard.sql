-- Harden web_review_checkout: `current_user_role() not in (...)` is NULL (not
-- true) for a signed-in user with no role, which would let future customer
-- accounts through. Coalesce so "no role" is always refused.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.web_review_checkout(uuid,text,text,text)'::regprocedure);
  v_def := replace(v_def,
    'if current_user_role() not in (''owner'',''partner'',''manager'') then',
    'if coalesce(current_user_role()::text, '''') not in (''owner'',''partner'',''manager'') then');
  execute v_def;
end $$;
