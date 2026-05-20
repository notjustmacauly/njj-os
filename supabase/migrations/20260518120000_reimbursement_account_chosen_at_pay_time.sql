-- =================================================================
-- Reimbursements: account chosen at pay time, not submit time.
-- A reimbursement is paying back someone's personal funds; the
-- approver decides which company account to draw from when they
-- actually pay it.
-- =================================================================

alter table public.payments
  alter column account_code drop not null;

update public.payments
   set account_code = null
 where type = 'reimbursement'
   and status = 'pending'
   and account_code is not null;

create or replace function public.create_payment_request(
  p_idempotency_key text,
  p_purpose text,
  p_amount numeric,
  p_account_code text default null,
  p_type text default 'general',
  p_payee text default null,
  p_category text default null,
  p_transfer_to_account_code text default null,
  p_notes text default null,
  p_requested_by_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_existing_id uuid; v_role public.app_role := current_user_role();
begin
  if p_type = 'reimbursement' then
    if v_role not in ('owner','partner','manager','staff') then
      raise exception 'insufficient privileges' using errcode = '42501';
    end if;
  else
    if v_role not in ('owner','partner','manager') then
      raise exception 'only owner, partner, or manager can submit payment requests' using errcode = '42501';
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.payments where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.payments (
    idempotency_key, type, purpose, payee, category, amount,
    account_code, transfer_to_account_code, status,
    requested_by_user_id, requested_by_name, notes
  ) values (
    p_idempotency_key, p_type::public.payment_type, p_purpose, p_payee, p_category, p_amount,
    p_account_code, p_transfer_to_account_code, 'pending',
    auth.uid(), p_requested_by_name, p_notes
  ) returning id into v_id;

  return v_id;
end; $$;

revoke all on function public.create_payment_request(text, text, numeric, text, text, text, text, text, text, text) from public;
grant execute on function public.create_payment_request(text, text, numeric, text, text, text, text, text, text, text) to authenticated;

drop policy if exists "tiered create payments" on public.payments;
create policy "tiered create payments" on public.payments for insert to authenticated
with check (
  status = 'pending'::public.payment_request_status and (
    (type = 'general'::public.payment_type
       and current_user_role() in ('owner','partner','manager'))
    or (type = 'transfer'::public.payment_type
       and current_user_role() in ('owner','partner','manager'))
    or (type = 'reimbursement'::public.payment_type
       and current_user_role() in ('owner','partner','manager','staff')
       and (current_user_role() <> 'staff' or requested_by_user_id = auth.uid()))
  )
);

create or replace function public.pay_payment(
  p_payment_id   uuid,
  p_paid_date    date default current_date,
  p_account_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay record; v_out_id uuid; v_in_id uuid;
        v_expense_id uuid; v_expense_ledger_id uuid;
        v_effective_account text;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can pay payments' using errcode = '42501';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found: %', p_payment_id using errcode = '23503';
  end if;

  if v_pay.type = 'reimbursement' then
    if current_user_role() <> 'owner' then
      raise exception 'only owner can pay reimbursements' using errcode = '42501';
    end if;
    if v_pay.status <> 'pending' then
      raise exception 'reimbursement must be pending to pay (got %)', v_pay.status using errcode = '22023';
    end if;
    v_effective_account := coalesce(p_account_code, v_pay.account_code);
    if v_effective_account is null then
      raise exception 'reimbursement requires p_account_code at pay time (which company account is paying back the personal funds)' using errcode = '22023';
    end if;
    if v_pay.account_code is distinct from v_effective_account then
      update public.payments set account_code = v_effective_account where id = p_payment_id;
      v_pay.account_code := v_effective_account;
    end if;
  else
    if v_pay.status <> 'approved' then
      raise exception 'payment must be approved before being paid (got %)', v_pay.status using errcode = '22023';
    end if;
    if v_pay.account_code is null then
      raise exception 'approved payment is missing account_code — re-approve to set it' using errcode = '22023';
    end if;
  end if;

  if not exists (select 1 from public.accounts where code = v_pay.account_code) then
    raise exception 'unknown account_code: %', v_pay.account_code using errcode = '23503';
  end if;

  if not public.user_can_use_account(v_pay.account_code) then
    raise exception 'you do not have access to account %', v_pay.account_code using errcode = '42501';
  end if;

  if v_pay.type = 'reimbursement' then
    v_expense_id := public.create_expense(
      p_idempotency_key := 'reimbursement-expense-' || v_pay.id::text,
      p_amount := v_pay.amount, p_category := v_pay.category,
      p_description := v_pay.purpose, p_account_code := v_pay.account_code,
      p_expense_date := p_paid_date, p_vendor := v_pay.payee,
      p_payment_ref := v_pay.external_id, p_notes := v_pay.notes,
      p_logged_by_name := v_pay.requested_by_name,
      p_override_threshold := true
    );
    select ledger_entry_id into v_expense_ledger_id from public.expenses where id = v_expense_id;
    v_out_id := v_expense_ledger_id;
  else
    v_out_id := public.ledger_apply(
      p_account_code := v_pay.account_code, p_direction := 'out', p_amount := v_pay.amount,
      p_ref_type := case when v_pay.type = 'transfer' then 'transfer' else 'payment' end,
      p_ref_id := v_pay.id, p_ref_external_id := v_pay.external_id,
      p_description := v_pay.purpose ||
        case when v_pay.type = 'transfer'
             then ' (transfer to ' || v_pay.transfer_to_account_code || ')'
             else '' end,
      p_idempotency_key := 'payment-out-' || v_pay.id::text,
      p_occurred_at := p_paid_date::timestamptz
    );
    if v_pay.type = 'transfer' then
      v_in_id := public.ledger_apply(
        p_account_code := v_pay.transfer_to_account_code, p_direction := 'in',
        p_amount := v_pay.amount, p_ref_type := 'transfer',
        p_ref_id := v_pay.id, p_ref_external_id := v_pay.external_id,
        p_description := v_pay.purpose || ' (transfer from ' || v_pay.account_code || ')',
        p_idempotency_key := 'payment-in-' || v_pay.id::text,
        p_occurred_at := p_paid_date::timestamptz
      );
    end if;
  end if;

  update public.payments
     set status = 'paid', paid_at = now(), paid_date = p_paid_date,
         paid_by_user_id = auth.uid(),
         ledger_entry_id_out = v_out_id, ledger_entry_id_in = v_in_id
   where id = p_payment_id;
end; $$;

revoke all on function public.pay_payment(uuid, date, text) from public;
grant execute on function public.pay_payment(uuid, date, text) to authenticated;

drop function if exists public.pay_payment(uuid, date);
