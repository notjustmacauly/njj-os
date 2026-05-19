-- =================================================================
-- Payment approval workflow + ₱20K expense threshold +
-- per-user account access + notifications on payment submission.
-- =================================================================

-- 1) team_members: per-user allowed account list ------------------

alter table public.team_members
  add column if not exists allowed_account_codes text[];

comment on column public.team_members.allowed_account_codes is
  'NULL = all accounts allowed (default). Non-null = restricted to listed codes. Owner is exempt regardless.';

update public.team_members
   set allowed_account_codes = array['GCash Expense','Corporate Account']
 where user_id = '24ecd839-0260-4198-baee-36c06c1511bf';

-- 2) Payments: approval state columns -----------------------------

alter table public.payments
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_user_id uuid;

-- 3) Helper: can the current user use a given account? ----------

create or replace function public.user_can_use_account(p_account_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_allowed text[];
begin
  if current_user_role() = 'owner' then return true; end if;

  select allowed_account_codes into v_allowed
    from public.team_members
   where user_id = auth.uid() and deleted_at is null;

  if v_allowed is null then return true; end if;

  return p_account_code = any(v_allowed);
end; $$;

grant execute on function public.user_can_use_account(text) to authenticated;

-- 4) approve_payment RPC ---------------------------------------

create or replace function public.approve_payment(
  p_payment_id   uuid,
  p_account_code text,
  p_notes        text default null
) returns void
language plpgsql security definer set search_path = public as $$
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

  update public.payments
     set status              = 'approved',
         account_code        = p_account_code,
         approved_at         = now(),
         approved_by_user_id = auth.uid(),
         notes               = case
                                 when p_notes is null or p_notes = '' then notes
                                 else coalesce(notes || E'\n', '') || 'Approved note: ' || p_notes
                               end
   where id = p_payment_id;
end; $$;

revoke all on function public.approve_payment(uuid, text, text) from public;
grant execute on function public.approve_payment(uuid, text, text) to authenticated;

-- 5) Modify pay_payment ---------------------------------------

create or replace function public.pay_payment(
  p_payment_id uuid,
  p_paid_date  date default current_date
) returns void
language plpgsql security definer set search_path = public as $$
declare v_pay record; v_out_id uuid; v_in_id uuid;
        v_expense_id uuid; v_expense_ledger_id uuid;
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
  else
    if v_pay.status <> 'approved' then
      raise exception 'payment must be approved before being paid (got %)', v_pay.status using errcode = '22023';
    end if;
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

revoke all on function public.pay_payment(uuid, date) from public;
grant execute on function public.pay_payment(uuid, date) to authenticated;

-- 6) Modify create_payment_request ----------------------------

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
    if p_account_code is null then
      raise exception 'reimbursement requires account_code (the company account that pays the team member back)' using errcode = '22023';
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
       and (current_user_role() <> 'staff' or requested_by_user_id = auth.uid())
       and account_code is not null)
  )
);

-- 7) Modify create_expense ----------------------------------

create or replace function public.create_expense(
  p_idempotency_key   text,
  p_amount            numeric,
  p_category          text,
  p_description       text,
  p_account_code      text,
  p_expense_date      date    default current_date,
  p_vendor            text    default null,
  p_payment_ref       text    default null,
  p_receipt_url       text    default null,
  p_notes             text    default null,
  p_logged_by_name    text    default null,
  p_override_threshold boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := current_user_role();
  v_expense_id uuid; v_existing_id uuid; v_ledger_id uuid; v_external_id text;
begin
  if v_role not in ('owner','partner','manager') then
    raise exception 'only owner, partner, or manager can create expenses' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_amount >= 20000 then
    if v_role = 'manager' then
      raise exception 'expenses ≥ ₱20,000 must be submitted as a payment request for owner/partner approval' using errcode = '22023';
    elsif not coalesce(p_override_threshold, false) then
      raise exception 'expense ≥ ₱20,000 requires explicit threshold override (use only when the payment already happened and is being logged retroactively)' using errcode = '22023';
    end if;
  end if;

  if not public.user_can_use_account(p_account_code) then
    raise exception 'you do not have access to account %', p_account_code using errcode = '42501';
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

revoke all on function public.create_expense(text, numeric, text, text, text, date, text, text, text, text, text, boolean) from public;
grant execute on function public.create_expense(text, numeric, text, text, text, date, text, text, text, text, text, boolean) to authenticated;

drop policy if exists "owner manages expenses" on public.expenses;
create policy "operational manage expenses" on public.expenses for all to authenticated
  using (current_user_role() in ('owner','partner','manager'))
  with check (current_user_role() in ('owner','partner','manager'));

-- 8) Notifications trigger on payment submission --------------

create or replace function public.notify_on_payment_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount_fmt text;
  v_msg text;
  v_link text;
begin
  v_amount_fmt := '₱' || to_char(new.amount, 'FM999,999,990.00');

  if new.type = 'reimbursement' then
    v_msg := coalesce(new.requested_by_name, 'A team member') || ' submitted ' || v_amount_fmt
          || ' for ' || coalesce(new.purpose, 'reimbursement');
    v_link := '/dashboard/finance/reimbursements/' || new.id::text;
    insert into public.notifications (recipient_role, type, title, message, link, created_by_user_id)
      values ('owner', 'reimbursement_pending', 'Reimbursement to review',
              v_msg, v_link, new.requested_by_user_id);
  else
    v_msg := coalesce(new.requested_by_name, 'Someone') || ' wants to pay '
          || coalesce(new.payee, '(no payee)') || ' ' || v_amount_fmt
          || ' for ' || coalesce(new.purpose, '(no purpose)');
    v_link := '/dashboard/finance/payments/' || new.id::text;
    insert into public.notifications (recipient_role, type, title, message, link, created_by_user_id)
      values ('owner', 'payment_pending_approval', 'Payment needs approval',
              v_msg, v_link, new.requested_by_user_id);
    insert into public.notifications (recipient_role, type, title, message, link, created_by_user_id)
      values ('partner', 'payment_pending_approval', 'Payment needs approval',
              v_msg, v_link, new.requested_by_user_id);
  end if;
  return new;
end; $$;

drop trigger if exists notify_on_payment_submission_trg on public.payments;
create trigger notify_on_payment_submission_trg
  after insert on public.payments
  for each row execute function public.notify_on_payment_submission();
