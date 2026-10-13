-- The member wall's custom `raise sqlstate 'PGRST'` payload isn't parsed by
-- this PostgREST version (PGRST121 → HTTP 500). Use the standard
-- insufficient_privilege error instead, which PostgREST maps to 403 for
-- signed-in users. Same allow-list, same behaviour; only the status changes.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.check_request()'::regprocedure);
  v_def := replace(v_def,
$a$    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'member_wall', 'message', 'This account can''t access that.')::text,
      detail = json_build_object('status', 403)::text;$a$,
$b$    raise insufficient_privilege using message = 'This account can''t access that.', hint = 'member_wall';$b$);
  if position('insufficient_privilege' in v_def) = 0 then
    raise exception 'check_request body not as expected; nothing changed';
  end if;
  execute v_def;
end $$;
