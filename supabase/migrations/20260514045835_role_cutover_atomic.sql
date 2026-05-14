-- ============================================================
-- ROLE CUTOVER (atomic)
-- Retires 'admin' and 'ops'; activates 'owner' and 'partner'.
-- Updates user_roles, every RPC role check, and every RLS policy
-- to match docs/specs/ROLE_ACCESS_MATRIX.md.
-- ============================================================

-- 1) Data migration -------------------------------------------------
update public.user_roles set role = 'owner' where role = 'admin';
update public.user_roles set role = 'manager' where role = 'ops';

-- 2) RPC rewrites ---------------------------------------------------
create or replace function public.mark_order_paid(
  p_order_id uuid, p_account_code text, p_amount numeric default null, p_paid_date date default current_date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_order record; v_amount numeric; v_entry uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'order not found: %', p_order_id using errcode = '23503'; end if;
  if v_order.payment_status = 'Paid' then return null; end if;
  if v_order.channel = 'B2B' then
    raise exception 'B2B orders are paid via bills — use mark_bill_paid' using errcode = '22023';
  end if;
  v_amount := coalesce(p_amount, v_order.total);
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  v_entry := public.ledger_apply(
    p_account_code := p_account_code, p_direction := 'in', p_amount := v_amount,
    p_ref_type := 'order', p_ref_id := v_order.id, p_ref_external_id := v_order.external_id,
    p_description := 'Order ' || v_order.external_id || ' paid',
    p_idempotency_key := 'order-paid-' || v_order.id::text,
    p_occurred_at := p_paid_date::timestamptz
  );
  update public.orders set payment_status = 'Paid' where id = p_order_id;
  return v_entry;
end; $$;

create or replace function public.cancel_order(
  p_order_id uuid, p_reason text default null, p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order record; v_ledger_count int;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to cancel orders' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'order not found' using errcode = '23503'; end if;
  if v_order.deleted_at is not null then
    return jsonb_build_object('order_id', p_order_id, 'already_cancelled', true);
  end if;
  select count(*) into v_ledger_count from public.ledger_entries
    where ref_type = 'order' and ref_id = p_order_id;
  if v_ledger_count > 0 then
    raise exception 'order has % ledger entries — refund the payment(s) via Finance before cancelling',
      v_ledger_count using errcode = '22023';
  end if;
  update public.orders
     set deleted_at = now(),
         notes = case when p_reason is null or p_reason = '' then notes
                      else coalesce(notes || E'\n', '') || 'Cancelled: ' || p_reason end
   where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'cancelled_at', now());
end; $$;

create or replace function public.mark_bill_paid(
  p_bill_id uuid, p_account_code text, p_paid_amount numeric, p_paid_date date default current_date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_bill record; v_ledger_id uuid; v_order_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to mark bills paid' using errcode = '42501';
  end if;
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then raise exception 'bill not found' using errcode = '23503'; end if;
  if v_bill.status <> 'issued' then
    raise exception 'bill must be in issued status to mark paid (got %)', v_bill.status using errcode = '22023';
  end if;
  if p_paid_amount is null or p_paid_amount <= 0 then
    raise exception 'paid_amount must be positive' using errcode = '22023';
  end if;
  v_ledger_id := public.ledger_apply(
    p_account_code := p_account_code, p_direction := 'in', p_amount := p_paid_amount,
    p_ref_type := 'bill', p_ref_id := p_bill_id, p_ref_external_id := v_bill.external_id,
    p_description := 'Bill ' || v_bill.external_id || ' paid',
    p_idempotency_key := 'bill-paid-' || p_bill_id::text,
    p_occurred_at := p_paid_date::timestamptz
  );
  update public.bills
     set status = 'paid', paid_amount = p_paid_amount, paid_date = p_paid_date,
         paid_account_code = p_account_code, ledger_entry_id = v_ledger_id
   where id = p_bill_id;
  for v_order_id in
    select r.order_id from public.bill_receivables br
    join public.receivables r on r.id = br.receivable_id
    where br.bill_id = p_bill_id
  loop
    update public.orders set payment_status = 'Paid' where id = v_order_id;
  end loop;
  update public.receivables set status = 'paid'
   where id in (select receivable_id from public.bill_receivables where bill_id = p_bill_id);
  return v_ledger_id;
end; $$;

create or replace function public.cancel_bill(p_bill_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_bill record;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can cancel bills' using errcode = '42501';
  end if;
  select * into v_bill from public.bills where id = p_bill_id;
  if not found then raise exception 'bill not found' using errcode = '23503'; end if;
  update public.bills
     set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
   where id = p_bill_id;
  update public.receivables set status = 'pending', bill_id = null
   where id in (select receivable_id from public.bill_receivables where bill_id = p_bill_id);
end; $$;

create or replace function public.issue_bill(p_bill_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can issue bills' using errcode = '42501';
  end if;
  update public.bills set status = 'issued', issued_at = now() where id = p_bill_id;
  update public.receivables set status = 'billed'
   where id in (select receivable_id from public.bill_receivables where bill_id = p_bill_id);
end; $$;

create or replace function public.create_expense(
  p_idempotency_key text, p_amount numeric, p_category text, p_description text, p_account_code text,
  p_expense_date date default current_date, p_vendor text default null, p_payment_ref text default null,
  p_receipt_url text default null, p_notes text default null, p_logged_by_name text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_expense_id uuid; v_existing_id uuid; v_ledger_id uuid; v_external_id text;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can create expenses' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_idempotency_key is not null then
    select id into v_existing_id from public.expenses where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;
  insert into public.expenses (
    idempotency_key, amount, category, description, account_code,
    expense_date, vendor, payment_ref, receipt_url, notes,
    logged_by_user_id, logged_by_name
  ) values (
    p_idempotency_key, p_amount, p_category, p_description, p_account_code,
    p_expense_date, p_vendor, p_payment_ref, p_receipt_url, p_notes,
    auth.uid(), p_logged_by_name
  ) returning id, external_id into v_expense_id, v_external_id;
  v_ledger_id := public.ledger_apply(
    p_account_code := p_account_code, p_direction := 'out', p_amount := p_amount,
    p_ref_type := 'expense', p_ref_id := v_expense_id, p_ref_external_id := v_external_id,
    p_description := p_description,
    p_idempotency_key := 'expense-' || v_expense_id::text,
    p_occurred_at := p_expense_date::timestamptz
  );
  update public.expenses set ledger_entry_id = v_ledger_id where id = v_expense_id;
  return v_expense_id;
end; $$;

create or replace function public.void_expense(p_expense_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_expense record; v_reversal uuid;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can void expenses' using errcode = '42501';
  end if;
  select * into v_expense from public.expenses where id = p_expense_id;
  if not found then raise exception 'expense not found: %', p_expense_id using errcode = '23503'; end if;
  if v_expense.voided_at is not null then
    raise exception 'expense already voided' using errcode = '22023';
  end if;
  if v_expense.ledger_entry_id is null then
    raise exception 'expense has no linked ledger entry — cannot reverse' using errcode = '23502';
  end if;
  v_reversal := public.ledger_reverse(v_expense.ledger_entry_id, coalesce(p_reason, 'expense voided'));
  update public.expenses set voided_at = now(), voided_by_user_id = auth.uid(), void_reason = p_reason
   where id = p_expense_id;
  return v_reversal;
end; $$;

create or replace function public.create_payment_request(
  p_idempotency_key text, p_purpose text, p_amount numeric, p_account_code text,
  p_type text default 'general', p_payee text default null, p_category text default null,
  p_transfer_to_account_code text default null, p_notes text default null,
  p_requested_by_name text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_existing_id uuid; v_role public.app_role := current_user_role();
begin
  if p_type = 'reimbursement' then
    if v_role not in ('owner','partner','manager','staff') then
      raise exception 'insufficient privileges' using errcode = '42501';
    end if;
  elsif p_type = 'transfer' then
    if v_role <> 'owner' then
      raise exception 'only owner can request transfers' using errcode = '42501';
    end if;
  else
    if v_role <> 'owner' then
      raise exception 'only owner can create general payment requests' using errcode = '42501';
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

create or replace function public.pay_payment(p_payment_id uuid, p_paid_date date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay record; v_out_id uuid; v_in_id uuid; v_expense_id uuid; v_expense_ledger_id uuid;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can pay payments' using errcode = '42501';
  end if;
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'payment not found: %', p_payment_id using errcode = '23503'; end if;
  if v_pay.status <> 'pending' then
    raise exception 'payment must be pending to pay (got %)', v_pay.status using errcode = '22023';
  end if;
  if v_pay.type = 'reimbursement' then
    v_expense_id := public.create_expense(
      p_idempotency_key := 'reimbursement-expense-' || v_pay.id::text,
      p_amount := v_pay.amount, p_category := v_pay.category,
      p_description := v_pay.purpose, p_account_code := v_pay.account_code,
      p_expense_date := p_paid_date, p_vendor := v_pay.payee,
      p_payment_ref := v_pay.external_id, p_notes := v_pay.notes,
      p_logged_by_name := v_pay.requested_by_name
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

create or replace function public.cancel_payment(p_payment_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay record;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can cancel payments' using errcode = '42501';
  end if;
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'payment not found' using errcode = '23503'; end if;
  if v_pay.status = 'cancelled' then return; end if;
  if v_pay.status = 'paid' then
    raise exception 'paid payments cannot be cancelled directly; use ledger_reverse' using errcode = '22023';
  end if;
  update public.payments
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by_user_id = auth.uid(), cancel_reason = p_reason
   where id = p_payment_id;
end; $$;

create or replace function public.ledger_apply(
  p_account_code text, p_direction text, p_amount numeric,
  p_ref_type text, p_ref_id uuid default null, p_ref_external_id text default null,
  p_description text default null, p_idempotency_key text default null,
  p_occurred_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_entry_id uuid; v_existing_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager','staff') then
    raise exception 'insufficient privileges to write ledger' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive (got %)', p_amount using errcode = '22023';
  end if;
  if p_direction not in ('in','out') then
    raise exception 'direction must be ''in'' or ''out'' (got %)', p_direction using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'unknown account_code: %', p_account_code using errcode = '23503';
  end if;
  if p_idempotency_key is not null then
    select id into v_existing_id from public.ledger_entries where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;
  insert into public.ledger_entries (
    occurred_at, account_code, direction, amount,
    ref_type, ref_id, ref_external_id, description,
    idempotency_key, created_by_user_id
  ) values (
    p_occurred_at, p_account_code, p_direction::public.ledger_direction, p_amount,
    p_ref_type, p_ref_id, p_ref_external_id, p_description,
    p_idempotency_key, auth.uid()
  ) returning id into v_entry_id;
  return v_entry_id;
end; $$;

create or replace function public.ledger_reverse(p_original_entry_id uuid, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_orig record; v_reverse_dir public.ledger_direction; v_idempotency_key text;
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can reverse ledger entries' using errcode = '42501';
  end if;
  select * into v_orig from public.ledger_entries where id = p_original_entry_id;
  if not found then raise exception 'ledger entry not found: %', p_original_entry_id using errcode = '23503'; end if;
  v_reverse_dir := case v_orig.direction when 'in' then 'out'::public.ledger_direction
                                          else 'in'::public.ledger_direction end;
  v_idempotency_key := 'reversal-of-' || p_original_entry_id::text;
  return public.ledger_apply(
    p_account_code := v_orig.account_code, p_direction := v_reverse_dir::text,
    p_amount := v_orig.amount, p_ref_type := 'reversal', p_ref_id := v_orig.id,
    p_ref_external_id := v_orig.ref_external_id,
    p_description := 'Reversal: ' || coalesce(p_reason, 'no reason given'),
    p_idempotency_key := v_idempotency_key, p_occurred_at := now()
  );
end; $$;

create or replace function public.create_pos_transaction(
  p_idempotency_key text, p_payment_method text, p_shift_id uuid default null,
  p_account_code text default null, p_event_name text default null,
  p_transaction_at timestamptz default now(), p_discount numeric default 0,
  p_staff_name text default null, p_notes text default null, p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_txn_id uuid; v_existing_id uuid; v_method_enum public.pos_payment_method;
  v_account text; v_event text; v_item jsonb;
begin
  if current_user_role() not in ('owner','partner','manager','staff') then
    raise exception 'insufficient privileges to create POS transactions' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select id into v_existing_id from public.pos_transactions where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;
  v_method_enum := p_payment_method::public.pos_payment_method;
  v_account := coalesce(p_account_code, public.account_for_payment_method(v_method_enum));
  if p_event_name is null and p_shift_id is not null then
    select event_name into v_event from public.pos_shifts where id = p_shift_id;
  else
    v_event := p_event_name;
  end if;
  insert into public.pos_transactions (
    idempotency_key, shift_id, transaction_at, event_name,
    payment_method, account_code, discount, staff_name, staff_user_id, notes
  ) values (
    p_idempotency_key, p_shift_id, p_transaction_at, v_event,
    v_method_enum, v_account, coalesce(p_discount, 0), p_staff_name, auth.uid(), p_notes
  ) returning id into v_txn_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.pos_transaction_items (
      transaction_id, item_type, sku_code, ticket_type_code, label,
      qty, unit_price, batch_id, notes
    ) values (
      v_txn_id, (v_item->>'item_type')::public.pos_item_type,
      v_item->>'sku_code', v_item->>'ticket_type_code', v_item->>'label',
      (v_item->>'qty')::int, (v_item->>'unit_price')::numeric,
      nullif(v_item->>'batch_id', '')::uuid, v_item->>'notes'
    );
  end loop;
  return v_txn_id;
end; $$;

create or replace function public.open_pos_shift(
  p_event_name text, p_shift_date date default current_date,
  p_opening_cash numeric default 0, p_staff_name text default null,
  p_default_batch_pcl uuid default null, p_default_batch_acg uuid default null,
  p_default_batch_wpm uuid default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_shift_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager','staff') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.pos_shifts
    where staff_user_id = auth.uid() and closed_at is null and deleted_at is null
  ) then
    raise exception 'you already have an open shift' using errcode = '22023';
  end if;
  insert into public.pos_shifts (
    event_name, shift_date, opening_cash, staff_name, staff_user_id,
    default_batch_pcl, default_batch_acg, default_batch_wpm, notes
  ) values (
    p_event_name, p_shift_date, coalesce(p_opening_cash, 0),
    p_staff_name, auth.uid(),
    p_default_batch_pcl, p_default_batch_acg, p_default_batch_wpm, p_notes
  ) returning id into v_shift_id;
  return v_shift_id;
end; $$;

create or replace function public.close_pos_shift(
  p_shift_id uuid, p_closing_cash numeric, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_shift record; v_expected numeric; v_variance numeric;
  v_acct record; v_event_label text; v_posted_count int := 0;
begin
  if current_user_role() not in ('owner','partner','manager','staff') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  select * into v_shift from public.pos_shifts where id = p_shift_id;
  if not found then raise exception 'shift not found' using errcode = '23503'; end if;
  if v_shift.closed_at is not null then
    raise exception 'shift already closed' using errcode = '22023';
  end if;
  if current_user_role() = 'staff' and v_shift.staff_user_id <> auth.uid() then
    raise exception 'cannot close another user''s shift' using errcode = '42501';
  end if;
  select coalesce(sum(total), 0) into v_expected
  from public.pos_transactions
  where shift_id = p_shift_id and payment_method = 'Cash' and deleted_at is null;
  v_expected := v_expected + v_shift.opening_cash;
  v_variance := p_closing_cash - v_expected;
  update public.pos_shifts
     set closed_at = now(), closing_cash = p_closing_cash,
         notes = case when p_notes is null or p_notes = '' then notes
                      else coalesce(notes || E'\n', '') || p_notes end
   where id = p_shift_id;
  v_event_label := coalesce(nullif(v_shift.event_name, ''), 'POS Shift')
                || ' · ' || to_char(coalesce(v_shift.opened_at, now())::date, 'YYYY-MM-DD');
  for v_acct in
    select account_code, sum(total) as total_amount
    from public.pos_transactions
    where shift_id = p_shift_id and deleted_at is null
    group by account_code having sum(total) > 0
  loop
    perform public.ledger_apply(
      p_account_code := v_acct.account_code, p_direction := 'in',
      p_amount := v_acct.total_amount, p_ref_type := 'pos_shift', p_ref_id := p_shift_id,
      p_description := 'POS · ' || v_event_label || ' · ' || v_acct.account_code,
      p_idempotency_key := 'pos-shift-' || p_shift_id::text || '-' || v_acct.account_code,
      p_occurred_at := now()
    );
    v_posted_count := v_posted_count + 1;
  end loop;
  return jsonb_build_object(
    'shift_id', p_shift_id, 'expected', v_expected,
    'closing_cash', p_closing_cash, 'variance', v_variance,
    'ledger_postings', v_posted_count
  );
end; $$;

create or replace function public.force_close_pos_shift(
  p_shift_id uuid, p_closing_cash numeric, p_reason text default 'force-closed by owner'
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can force-close shifts' using errcode = '42501';
  end if;
  return public.close_pos_shift(p_shift_id, p_closing_cash, p_reason);
end; $$;

create or replace function public.create_batch(
  p_idempotency_key text, p_sku_code text, p_batch_date date default current_date,
  p_units_planned integer default 0, p_units_produced integer default 0, p_wastage integer default 0,
  p_ph numeric default null, p_brix numeric default null, p_qc_passed boolean default null,
  p_qc_notes text default null, p_staff_name text default null, p_notes text default null,
  p_inputs jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_batch_id uuid; v_existing_id uuid; v_input jsonb;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to create batches' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select id into v_existing_id from public.batches where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;
  insert into public.batches (
    idempotency_key, sku_code, batch_date, units_planned, units_produced, wastage,
    ph, brix, qc_passed, qc_notes, staff_name, staff_user_id, notes
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), coalesce(p_units_produced, 0), coalesce(p_wastage, 0),
    p_ph, p_brix, p_qc_passed, p_qc_notes, p_staff_name, auth.uid(), p_notes
  ) returning id into v_batch_id;
  for v_input in select * from jsonb_array_elements(p_inputs) loop
    insert into public.batch_inputs (batch_id, ingredient_code, qty_used, unit, cost_per_unit)
      values (v_batch_id, v_input->>'ingredient_code',
              (v_input->>'qty_used')::numeric, v_input->>'unit',
              coalesce((v_input->>'cost_per_unit')::numeric, 0));
  end loop;
  return v_batch_id;
end; $$;

create or replace function public.create_order(
  p_idempotency_key text, p_channel text, p_partner_id uuid default null,
  p_customer_name text default null, p_event_name text default null,
  p_order_date date default current_date, p_delivery_date date default null,
  p_delivery_fee numeric default null, p_discount numeric default 0,
  p_override_total numeric default null, p_notes text default null, p_items jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_order_id uuid; v_existing_id uuid; v_partner_delivery numeric;
  v_item jsonb; v_sku_code text; v_qty integer; v_unit_price numeric; v_batch_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to create orders' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select id into v_existing_id from public.orders where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;
  if p_delivery_fee is null and p_partner_id is not null then
    select delivery_fee into v_partner_delivery from public.partners where id = p_partner_id;
    p_delivery_fee := coalesce(v_partner_delivery, 0);
  end if;
  p_delivery_fee := coalesce(p_delivery_fee, 0);
  insert into public.orders (
    idempotency_key, channel, partner_id, customer_name, event_name,
    order_date, delivery_date, delivery_fee, discount, override_total, notes,
    created_by_user_id
  ) values (
    p_idempotency_key, p_channel::public.order_channel, p_partner_id, p_customer_name, p_event_name,
    p_order_date, p_delivery_date, p_delivery_fee, p_discount, p_override_total, p_notes,
    auth.uid()
  ) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sku_code := v_item->>'sku_code';
    v_qty := (v_item->>'qty')::int;
    v_batch_id := nullif(v_item->>'batch_id', '')::uuid;
    if v_sku_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid order item: %', v_item using errcode = '22023';
    end if;
    if v_item ? 'unit_price' and (v_item->>'unit_price') is not null then
      v_unit_price := (v_item->>'unit_price')::numeric;
    elsif p_partner_id is not null then
      v_unit_price := public.partner_price_for_sku(p_partner_id, v_sku_code);
    else
      select retail_price into v_unit_price from public.skus where code = v_sku_code;
    end if;
    insert into public.order_items (order_id, sku_code, qty, unit_price, batch_id)
      values (v_order_id, v_sku_code, v_qty, v_unit_price, v_batch_id);
  end loop;
  return v_order_id;
end; $$;

create or replace function public.check_in_ticket(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ticket record; v_email text;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'ticket_not_found'); end if;
  if v_ticket.checked_in_at is not null then
    return jsonb_build_object('ok', true, 'already_checked_in', true,
      'checked_in_at', v_ticket.checked_in_at,
      'checked_in_by_name', v_ticket.checked_in_by_name,
      'ticket_id', v_ticket.id);
  end if;
  select email into v_email from auth.users where id = auth.uid();
  update public.tickets
     set checked_in_at = now(), checked_in_by_user_id = auth.uid(),
         checked_in_by_name = coalesce(v_email, 'Staff')
   where id = p_ticket_id;
  return jsonb_build_object('ok', true, 'already_checked_in', false,
    'ticket_id', p_ticket_id, 'event_name', v_ticket.event_name,
    'event_date', v_ticket.event_date, 'buyer_name', v_ticket.buyer_name,
    'ticket_type', v_ticket.ticket_type_name);
end; $$;

create or replace function public.resolve_integration_error(p_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() <> 'owner' then
    raise exception 'only owner can resolve integration errors' using errcode = '42501';
  end if;
  update public.integration_errors
    set resolved_at = now(), resolved_by_user_id = auth.uid(), resolution_notes = p_notes
   where id = p_id and resolved_at is null;
end; $$;

-- 3) RLS policy rewrites -------------------------------------------

-- accounts
drop policy if exists "admin manages accounts" on public.accounts;
create policy "owner manages accounts" on public.accounts for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- audit_log
drop policy if exists "admin reads everything" on public.audit_log;
create policy "owner reads audit_log" on public.audit_log for select to authenticated
  using (current_user_role() = 'owner');
drop policy if exists "non-admin reads own actions" on public.audit_log;
create policy "non-owner reads own actions" on public.audit_log for select to authenticated
  using (current_user_role() in ('partner','manager','staff') and actor_id = auth.uid());

-- batches
drop policy if exists "ops+ manage batches" on public.batches;
create policy "operational manages batches" on public.batches for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- batch_inputs
drop policy if exists "ops+ manage batch_inputs" on public.batch_inputs;
create policy "operational manages batch_inputs" on public.batch_inputs for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- bills
drop policy if exists "admin+manager manage bills" on public.bills;
create policy "owner manages bills" on public.bills for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');
drop policy if exists "ops+ read bills" on public.bills;
create policy "operational reads bills" on public.bills for select to authenticated
  using (current_user_role() in ('owner','partner','manager'));

-- bill_receivables
drop policy if exists "admin+manager manage bill_receivables" on public.bill_receivables;
create policy "owner manages bill_receivables" on public.bill_receivables for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');
drop policy if exists "ops+ read bill_receivables" on public.bill_receivables;
create policy "operational reads bill_receivables" on public.bill_receivables for select to authenticated
  using (current_user_role() in ('owner','partner','manager'));

-- deductions
drop policy if exists "admin+manager manage deductions" on public.deductions;
create policy "operational manages deductions" on public.deductions for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));
drop policy if exists "ops+ read deductions" on public.deductions;
create policy "all read deductions" on public.deductions for select to authenticated
  using (current_user_role() is not null);

-- deduction_items
drop policy if exists "admin+manager manage deduction_items" on public.deduction_items;
create policy "operational manages deduction_items" on public.deduction_items for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));
drop policy if exists "ops+ read deduction_items" on public.deduction_items;
create policy "all read deduction_items" on public.deduction_items for select to authenticated
  using (current_user_role() is not null);

-- expenses
drop policy if exists "admin+manager manage expenses" on public.expenses;
create policy "owner manages expenses" on public.expenses for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');
drop policy if exists "ops+ read expenses" on public.expenses;
create policy "operational reads expenses" on public.expenses for select to authenticated
  using (current_user_role() in ('owner','partner','manager'));

-- ingredients
drop policy if exists "admin+manager manage ingredients" on public.ingredients;
create policy "principals manage ingredients" on public.ingredients for all to authenticated
  using (current_user_role() in ('owner','partner'))
  with check (current_user_role() in ('owner','partner'));

-- integration_errors
drop policy if exists "admin+manager read errors" on public.integration_errors;
create policy "owner reads integration_errors" on public.integration_errors for select to authenticated
  using (current_user_role() = 'owner');
drop policy if exists "admin+manager resolve errors" on public.integration_errors;
create policy "owner resolves integration_errors" on public.integration_errors for update to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- ledger_entries
drop policy if exists "ops+ read ledger_entries" on public.ledger_entries;
create policy "principals read ledger_entries" on public.ledger_entries for select to authenticated
  using (current_user_role() in ('owner','partner'));

-- order_items
drop policy if exists "ops+ manage order_items" on public.order_items;
create policy "operational manages order_items" on public.order_items for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- orders
drop policy if exists "ops+ manage orders" on public.orders;
create policy "operational manages orders" on public.orders for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- partner_tiers
drop policy if exists "admin manages partner_tiers" on public.partner_tiers;
create policy "principals manage partner_tiers" on public.partner_tiers for all to authenticated
  using (current_user_role() in ('owner','partner'))
  with check (current_user_role() in ('owner','partner'));

-- partners
drop policy if exists "admin+manager manage partners" on public.partners;
create policy "operational manages partners" on public.partners for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- payments
drop policy if exists "tiered create payments" on public.payments;
create policy "tiered create payments" on public.payments for insert to authenticated
with check (
  status = 'pending'::public.payment_request_status and (
    (type = 'general'::public.payment_type and current_user_role() = 'owner')
    or (type = 'transfer'::public.payment_type and current_user_role() = 'owner')
    or (type = 'reimbursement'::public.payment_type
        and current_user_role() in ('owner','partner','manager','staff')
        and (current_user_role() <> 'staff' or requested_by_user_id = auth.uid())
       )
  )
);

drop policy if exists "ops+ read payments" on public.payments;
create policy "operational reads payments" on public.payments for select to authenticated
  using (current_user_role() in ('owner','partner','manager') and deleted_at is null);

drop policy if exists "admin+manager update payments" on public.payments;
create policy "owner updates payments" on public.payments for update to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- pos_bundles
drop policy if exists "admin+manager manage pos_bundles" on public.pos_bundles;
create policy "principals manage pos_bundles" on public.pos_bundles for all to authenticated
  using (current_user_role() in ('owner','partner'))
  with check (current_user_role() in ('owner','partner'));

-- pos_products
drop policy if exists "admin+manager manage pos_products" on public.pos_products;
create policy "principals manage pos_products" on public.pos_products for all to authenticated
  using (current_user_role() in ('owner','partner'))
  with check (current_user_role() in ('owner','partner'));

-- pos_shifts
drop policy if exists "ops+ manage pos_shifts" on public.pos_shifts;
create policy "all roles manage pos_shifts" on public.pos_shifts for all to authenticated
  using (current_user_role() in ('owner','partner','manager','staff'))
  with check (current_user_role() in ('owner','partner','manager','staff'));

-- pos_transactions
drop policy if exists "all roles write pos_transactions" on public.pos_transactions;
create policy "all roles write pos_transactions" on public.pos_transactions for all to authenticated
  using (current_user_role() in ('owner','partner','manager','staff'))
  with check (current_user_role() in ('owner','partner','manager','staff'));

-- pos_transaction_items
drop policy if exists "all roles write pos_items" on public.pos_transaction_items;
create policy "all roles write pos_items" on public.pos_transaction_items for all to authenticated
  using (current_user_role() in ('owner','partner','manager','staff'))
  with check (current_user_role() in ('owner','partner','manager','staff'));

-- receivables
drop policy if exists "admin+manager manage receivables" on public.receivables;
create policy "owner manages receivables" on public.receivables for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');
drop policy if exists "ops+ read receivables" on public.receivables;
create policy "principals read receivables" on public.receivables for select to authenticated
  using (current_user_role() in ('owner','partner'));

-- skus
drop policy if exists "admin manages skus" on public.skus;
create policy "principals manage skus" on public.skus for all to authenticated
  using (current_user_role() in ('owner','partner'))
  with check (current_user_role() in ('owner','partner'));

-- sync_state
drop policy if exists "ops+ read sync_state" on public.sync_state;
create policy "owner reads sync_state" on public.sync_state for select to authenticated
  using (current_user_role() = 'owner');
drop policy if exists "admin manages sync_state" on public.sync_state;
create policy "owner manages sync_state" on public.sync_state for update to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- ticket_types
drop policy if exists "admin+manager manage ticket_types" on public.ticket_types;
create policy "principals manage ticket_types" on public.ticket_types for all to authenticated
  using (current_user_role() in ('owner','partner'))
  with check (current_user_role() in ('owner','partner'));

-- tickets
drop policy if exists "ops+ manage tickets" on public.tickets;
create policy "operational manages tickets" on public.tickets for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- user_roles
drop policy if exists "admin manages roles" on public.user_roles;
create policy "owner manages roles" on public.user_roles for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- wix_product_map
drop policy if exists "admin manages wix_product_map" on public.wix_product_map;
create policy "owner manages wix_product_map" on public.wix_product_map for all to authenticated
  using (current_user_role() = 'owner') with check (current_user_role() = 'owner');

-- 4) account_balances view: respect caller's RLS on ledger_entries
alter view public.account_balances set (security_invoker = true);
