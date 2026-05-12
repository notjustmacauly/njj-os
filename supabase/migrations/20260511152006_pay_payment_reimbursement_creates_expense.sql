-- When paying out a reimbursement, delegate the ledger posting to create_expense.
-- Net effect: one ledger out entry (ref_type='expense'), one expenses row, the
-- payment record linked to both. Re-running pay_payment for the same reimbursement
-- is a no-op end-to-end because both create_expense and ledger_apply use
-- deterministic idempotency keys derived from the IDs.

create or replace function public.pay_payment(p_payment_id uuid, p_paid_date date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay                record;
  v_out_id             uuid;
  v_in_id              uuid;
  v_expense_id         uuid;
  v_expense_ledger_id  uuid;
begin
  if current_user_role() not in ('admin','manager') then
    raise exception 'only admin or manager can pay payments' using errcode = '42501';
  end if;

  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found: %', p_payment_id using errcode = '23503';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'payment must be pending to pay (got %)', v_pay.status using errcode = '22023';
  end if;

  if v_pay.type = 'reimbursement' then
    -- Delegate ledger posting to create_expense. It posts ref_type='expense',
    -- which is the right reference: the underlying purchase IS an expense.
    -- The payment record points at the same ledger entry via ledger_entry_id_out
    -- so drill-down from either side works.
    v_expense_id := public.create_expense(
      p_idempotency_key := 'reimbursement-expense-' || v_pay.id::text,
      p_amount          := v_pay.amount,
      p_category        := v_pay.category,
      p_description     := v_pay.purpose,
      p_account_code    := v_pay.account_code,
      p_expense_date    := p_paid_date,
      p_vendor          := v_pay.payee,
      p_payment_ref     := v_pay.external_id,
      p_notes           := v_pay.notes,
      p_logged_by_name  := v_pay.requested_by_name
    );

    select ledger_entry_id into v_expense_ledger_id
      from public.expenses where id = v_expense_id;
    v_out_id := v_expense_ledger_id;
  else
    -- General payment or transfer: post out-ledger directly
    v_out_id := public.ledger_apply(
      p_account_code    := v_pay.account_code,
      p_direction       := 'out',
      p_amount          := v_pay.amount,
      p_ref_type        := case when v_pay.type = 'transfer' then 'transfer' else 'payment' end,
      p_ref_id          := v_pay.id,
      p_ref_external_id := v_pay.external_id,
      p_description     := v_pay.purpose ||
        case when v_pay.type = 'transfer'
             then ' (transfer to ' || v_pay.transfer_to_account_code || ')'
             else '' end,
      p_idempotency_key := 'payment-out-' || v_pay.id::text,
      p_occurred_at     := p_paid_date::timestamptz
    );

    if v_pay.type = 'transfer' then
      v_in_id := public.ledger_apply(
        p_account_code    := v_pay.transfer_to_account_code,
        p_direction       := 'in',
        p_amount          := v_pay.amount,
        p_ref_type        := 'transfer',
        p_ref_id           := v_pay.id,
        p_ref_external_id := v_pay.external_id,
        p_description     := v_pay.purpose || ' (transfer from ' || v_pay.account_code || ')',
        p_idempotency_key := 'payment-in-' || v_pay.id::text,
        p_occurred_at     := p_paid_date::timestamptz
      );
    end if;
  end if;

  update public.payments
     set status              = 'paid',
         paid_at             = now(),
         paid_date           = p_paid_date,
         paid_by_user_id     = auth.uid(),
         ledger_entry_id_out = v_out_id,
         ledger_entry_id_in  = v_in_id
   where id = p_payment_id;
end; $$;
