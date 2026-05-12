-- Rename accounts to match Mac's real bank/wallet setup.
-- Safe to run: no live rows reference the old codes (verified pre-migration).

update public.accounts
   set code = 'GCash Main',
       name = 'GCash Main'
 where code = 'GCash General';

update public.accounts
   set code = 'RCBC Main',
       name = 'RCBC Main'
 where code = 'Origin Account';

-- Repoint the payment-method-to-account map at the renamed codes.
create or replace function public.account_for_payment_method(p_method pos_payment_method)
returns text
language sql
immutable
as $$
  select case p_method
    when 'Cash'          then 'Cash'
    when 'GCash'         then 'GCash Main'
    when 'Bank Transfer' then 'RCBC Main'
    when 'Xendit'        then 'Xendit'
    else                      'Cash'
  end
$$;
