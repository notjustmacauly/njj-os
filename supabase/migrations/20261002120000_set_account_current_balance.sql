-- Let the owner set an account's CURRENT (live) balance to an exact amount.
-- current_balance = opening_balance + total_in - total_out, so to make the live
-- balance equal p_target we back-solve the opening figure. All ledger history is
-- preserved; the opening balance becomes the reconciliation offset.
create or replace function public.set_account_current_balance(p_code text, p_target numeric)
returns numeric language plpgsql security definer set search_path to 'public' as $function$
declare v_in numeric; v_out numeric; v_opening numeric;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can set account balances' using errcode='42501'; end if;
  if p_target is null then raise exception 'amount is required' using errcode='22023'; end if;
  if not exists (select 1 from public.accounts where code = p_code) then
    raise exception 'unknown account %', p_code using errcode='23503'; end if;

  select coalesce(total_in,0), coalesce(total_out,0)
    into v_in, v_out
  from public.account_balances where code = p_code;

  v_opening := p_target - (v_in - v_out);
  update public.accounts set opening_balance = v_opening, updated_at = now() where code = p_code;
  return v_opening;
end; $function$;
revoke all on function public.set_account_current_balance(text,numeric) from public, anon;
grant execute on function public.set_account_current_balance(text,numeric) to authenticated, service_role;
