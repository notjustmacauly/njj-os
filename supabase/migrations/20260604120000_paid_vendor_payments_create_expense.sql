-- =================================================================
-- Paid vendor payments must show up in the Expenses tracker.
--
-- Before: pay_payment() created an Expense row only for reimbursements.
--   * reimbursement -> create_expense() (expense + ledger 'out')   ✅ in tracker
--   * general (vendor) -> bare ledger_apply('out')                 ❌ not in tracker
--   * transfer -> ledger 'out' + ledger 'in'                       (internal move)
--
-- After: general (vendor) payments also go through create_expense(),
-- exactly like reimbursements — so paying a vendor records an Expense
-- AND the single cash-out (no double counting). Transfers are left
-- untouched: they are internal account-to-account moves, already
-- tracked as two ledger lines, and are NOT expenses.
-- =================================================================

create or replace function public.pay_payment(
  p_payment_id uuid,
  p_paid_date date default current_date,
  p_account_code text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  elsif v_pay.type = 'transfer' then
    -- Internal account-to-account move: two ledger lines, NOT an expense.
    v_out_id := public.ledger_apply(
      p_account_code := v_pay.account_code, p_direction := 'out', p_amount := v_pay.amount,
      p_ref_type := 'transfer', p_ref_id := v_pay.id, p_ref_external_id := v_pay.external_id,
      p_description := v_pay.purpose || ' (transfer to ' || v_pay.transfer_to_account_code || ')',
      p_idempotency_key := 'payment-out-' || v_pay.id::text,
      p_occurred_at := p_paid_date::timestamptz
    );
    v_in_id := public.ledger_apply(
      p_account_code := v_pay.transfer_to_account_code, p_direction := 'in',
      p_amount := v_pay.amount, p_ref_type := 'transfer',
      p_ref_id := v_pay.id, p_ref_external_id := v_pay.external_id,
      p_description := v_pay.purpose || ' (transfer from ' || v_pay.account_code || ')',
      p_idempotency_key := 'payment-in-' || v_pay.id::text,
      p_occurred_at := p_paid_date::timestamptz
    );

  else
    -- General vendor payment → record as an Expense.
    -- create_expense() inserts the expense row AND applies the single
    -- ledger 'out', so the cash-out is counted exactly once.
    v_expense_id := public.create_expense(
      p_idempotency_key := 'payment-expense-' || v_pay.id::text,
      p_amount := v_pay.amount, p_category := coalesce(v_pay.category, 'Other'),
      p_description := coalesce(v_pay.purpose, 'Vendor payment ' || v_pay.external_id),
      p_account_code := v_pay.account_code,
      p_expense_date := p_paid_date, p_vendor := v_pay.payee,
      p_payment_ref := v_pay.external_id, p_notes := v_pay.notes,
      p_logged_by_name := v_pay.requested_by_name,
      p_override_threshold := true
    );
    select ledger_entry_id into v_expense_ledger_id from public.expenses where id = v_expense_id;
    v_out_id := v_expense_ledger_id;
  end if;

  update public.payments
     set status = 'paid', paid_at = now(), paid_date = p_paid_date,
         paid_by_user_id = auth.uid(),
         ledger_entry_id_out = v_out_id, ledger_entry_id_in = v_in_id
   where id = p_payment_id;
end; $function$;

-- ── Backfill: the vendor payments already marked Paid never got an
-- Expense row. Create one for each, linked to the cash-out ledger entry
-- that ALREADY happened (reuse ledger_entry_id_out) so no extra money is
-- deducted. Idempotent via the unique idempotency_key.
insert into public.expenses (
  idempotency_key, amount, category, description, account_code,
  expense_date, vendor, payment_ref, notes, logged_by_name, ledger_entry_id
)
select
  'payment-expense-' || p.id::text,
  p.amount,
  coalesce(p.category, 'Other'),
  coalesce(p.purpose, 'Vendor payment ' || p.external_id),
  p.account_code,
  coalesce(p.paid_date, current_date),
  p.payee,
  p.external_id,
  p.notes,
  p.requested_by_name,
  p.ledger_entry_id_out
from public.payments p
where p.type = 'general'
  and p.status = 'paid'
  and p.deleted_at is null
  and not exists (
    select 1 from public.expenses e
     where e.idempotency_key = 'payment-expense-' || p.id::text
  );
