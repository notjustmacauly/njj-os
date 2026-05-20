-- =================================================================
-- 1) Partner can pay reimbursements (was Owner-only)
-- 2) Track who voided an ingredient lot (explicit columns for UI)
-- =================================================================

alter table public.ingredient_lots
  add column if not exists voided_by_user_id uuid,
  add column if not exists voided_by_name    text,
  add column if not exists void_reason       text;

comment on column public.ingredient_lots.voided_by_user_id is
  'Who voided this lot. Populated by void_ingredient_lot.';

create or replace function public.void_ingredient_lot(
  p_lot_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot          record;
  v_consumed_n   int;
  v_reversal_id  uuid;
  v_actor_name   text;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'only owner or partner can void ingredient lots' using errcode = '42501';
  end if;

  select * into v_lot from public.ingredient_lots where id = p_lot_id;
  if not found then
    raise exception 'lot not found: %', p_lot_id using errcode = '23503';
  end if;

  if v_lot.deleted_at is not null then
    return jsonb_build_object('lot_id', p_lot_id, 'already_voided', true, 'voided_at', v_lot.deleted_at);
  end if;

  if not public.user_can_use_account(v_lot.account_code) then
    raise exception 'you do not have access to the account this lot was paid from (%)', v_lot.account_code using errcode = '42501';
  end if;

  select count(*) into v_consumed_n
    from public.batch_inputs where lot_id = p_lot_id;

  if v_consumed_n > 0 then
    raise exception
      'lot has been consumed by % batch input(s) — use a manual ledger correction instead of voiding',
      v_consumed_n using errcode = '22023';
  end if;

  if v_lot.ledger_entry_id is not null then
    v_reversal_id := public.ledger_apply(
      p_account_code    := v_lot.account_code,
      p_direction       := 'in',
      p_amount          := v_lot.total_cost,
      p_ref_type        := 'reversal',
      p_ref_id          := v_lot.ledger_entry_id,
      p_ref_external_id := v_lot.external_id,
      p_description     := 'Reversal: lot ' || v_lot.external_id || ' voided'
                         || case when p_reason is null or p_reason = '' then ''
                                 else ' (' || p_reason || ')' end,
      p_idempotency_key := 'reversal-of-lot-' || p_lot_id::text,
      p_occurred_at     := now()
    );
  end if;

  select display_name into v_actor_name
    from public.team_members where user_id = auth.uid() and deleted_at is null;

  update public.ingredient_lots
     set deleted_at        = now(),
         voided_by_user_id = auth.uid(),
         voided_by_name    = v_actor_name,
         void_reason       = p_reason,
         notes = case
                   when p_reason is null or p_reason = '' then notes
                   else coalesce(notes || E'\n', '') || 'Voided: ' || p_reason
                 end
   where id = p_lot_id;

  return jsonb_build_object(
    'lot_id',                   p_lot_id,
    'voided_at',                now(),
    'voided_by',                v_actor_name,
    'reversal_ledger_entry_id', v_reversal_id
  );
end; $$;

revoke all on function public.void_ingredient_lot(uuid, text) from public;
grant execute on function public.void_ingredient_lot(uuid, text) to authenticated;

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
    if current_user_role() not in ('owner','partner') then
      raise exception 'only owner or partner can pay reimbursements' using errcode = '42501';
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
