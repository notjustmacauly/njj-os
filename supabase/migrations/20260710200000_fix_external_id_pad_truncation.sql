-- ============================================================================
-- Fix external_id generation truncation bug (took down POS).
--
-- Every external_id generator used lpad(nextval(seq)::text, 3, '0'). Postgres
-- lpad TRUNCATES strings longer than the target length, so once a sequence
-- passed 999 the 4-digit value was chopped to 3 chars: nextval 1049 -> "104",
-- colliding with the existing POS-...-104 on the unique external_id constraint.
-- Every ~10 values collapsed onto the same suffix. (to_char(n,'FM000') is no
-- good either — a fixed-width mask overflows to "###" past 999.)
--
-- Correct rule: pad to a MINIMUM of 3 digits, never truncate. This helper does
-- that, and every generator is repointed at it.
-- ============================================================================
create or replace function public.pad_min3(n bigint)
returns text
language sql
immutable
as $f$
  select case when n < 1000 then lpad(n::text, 3, '0') else n::text end
$f$;

do $mig$
declare r record; pat text; rep text; nd text;
begin
  -- lpad( <nextval(...)> ::text, 3, '0' )  ->  public.pad_min3( <nextval(...)> )
  pat := 'lpad\(\s*(nextval\([^)]*\))::text,\s*3,\s*' || chr(39) || '0' || chr(39) || '\s*\)';
  rep := 'public.pad_min3(\1)';
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and pg_get_functiondef(p.oid) ilike '%external_id%'
      and pg_get_functiondef(p.oid) ~ 'lpad\(\s*nextval'
  loop
    nd := regexp_replace(r.def, pat, rep, 'g');
    if nd <> r.def then execute nd; end if;
  end loop;
end $mig$;
