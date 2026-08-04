-- Let the approver correct a payment's details (amount / payee / category /
-- purpose) at approval time, alongside locking the account. Each new field is
-- optional: NULL means "leave unchanged", a value overwrites. Purpose can't be
-- blanked (kept if empty) since it's the human description of the payment.
drop function if exists public.approve_payment(uuid, text, text);

create or replace function public.approve_payment(
  p_payment_id   uuid,
  p_account_code text,
  p_notes        text default null,
  p_amount       numeric default null,
  p_payee        text default null,
  p_category     text default null,
  p_purpose      text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_pay record;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can approve payments' using errcode = '42501';
  end if;

  if not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'unknown account_code: %', p_account_code using errcode = '23503';
  end if;

  if not public.user_can_use_account(p_account_code) then
    raise exception 'you do not have access to account %', p_account_code using errcode = '42501';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found: %', p_payment_id using errcode = '23503';
  end if;
  if v_pay.type = 'reimbursement' then
    raise exception 'reimbursements are approved + paid in one step via pay_payment, not approve_payment' using errcode = '22023';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'payment must be pending to approve (got %)', v_pay.status using errcode = '22023';
  end if;

  if coalesce(p_amount, v_pay.amount) <= 0 then
    raise exception 'amount must be greater than 0' using errcode = '22023';
  end if;

  update public.payments
     set status              = 'approved',
         account_code        = p_account_code,
         amount              = coalesce(p_amount, amount),
         payee               = case when p_payee    is null then payee    else nullif(p_payee, '')    end,
         category            = case when p_category is null then category else nullif(p_category, '') end,
         purpose             = coalesce(nullif(p_purpose, ''), purpose),
         approved_at         = now(),
         approved_by_user_id = auth.uid(),
         notes               = case
                                 when p_notes is null or p_notes = '' then notes
                                 else coalesce(notes || E'\n', '') || 'Approved note: ' || p_notes
                               end
   where id = p_payment_id;
end; $function$;

grant execute on function public.approve_payment(uuid, text, text, numeric, text, text, text) to authenticated;
