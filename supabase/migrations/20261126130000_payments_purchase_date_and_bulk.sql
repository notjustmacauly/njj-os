-- Payments & reimbursements: (1) a dedicated purchase_date field (was kept in
-- notes), and (2) bulk approve / bulk pay so the owner can clear the queue in
-- one action instead of opening each request.
--
-- purchase_date is metadata only — it does NOT change how the expense is dated
-- in the ledger (expenses still post on paid_date). It records when the thing
-- was actually bought, shown as its own line in the UI.

alter table public.payments add column if not exists purchase_date date;

-- --- create_payment_request: carry purchase_date -------------------------------
-- Drop the prior signature first — adding a trailing param would otherwise
-- create a second overload and make calls ambiguous.
drop function if exists public.create_payment_request(text, text, numeric, text, text, text, text, text, text, text);

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
  p_requested_by_name text default null,
  p_purchase_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid; v_existing_id uuid; v_role public.app_role := current_user_role();
begin
  if v_role = 'marketing' then
    if p_type not in ('reimbursement','general') then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif p_type = 'reimbursement' then
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
    requested_by_user_id, requested_by_name, notes, purchase_date
  ) values (
    p_idempotency_key, p_type::public.payment_type, p_purpose, p_payee, p_category, p_amount,
    p_account_code, p_transfer_to_account_code, 'pending',
    auth.uid(), p_requested_by_name, p_notes, p_purchase_date
  ) returning id into v_id;

  return v_id;
end; $function$;

-- --- approve_payment: allow correcting purchase_date at approve ----------------
drop function if exists public.approve_payment(uuid, text, text, numeric, text, text, text);

create or replace function public.approve_payment(
  p_payment_id uuid,
  p_account_code text,
  p_notes text default null,
  p_amount numeric default null,
  p_payee text default null,
  p_category text default null,
  p_purpose text default null,
  p_purchase_date date default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_pay record;
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner') then
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
         purchase_date       = coalesce(p_purchase_date, purchase_date),
         approved_at         = now(),
         approved_by_user_id = auth.uid(),
         notes               = case
                                 when p_notes is null or p_notes = '' then notes
                                 else coalesce(notes || E'\n', '') || 'Approved note: ' || p_notes
                               end
   where id = p_payment_id;
end; $function$;

-- --- bulk approve -------------------------------------------------------------
-- Approves each selected pending general payment. Each payment keeps its own
-- requested account_code when set; p_account_code is the fallback for ones that
-- don't have one. Rows that can't be approved are skipped and reported, so one
-- bad row never blocks the rest.

create or replace function public.approve_payments_bulk(
  p_ids uuid[],
  p_account_code text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_acct text;
  v_ok int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner') then
    raise exception 'only owner or partner can approve payments' using errcode = '42501';
  end if;

  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    begin
      select coalesce(account_code, p_account_code) into v_acct
      from public.payments where id = v_id;
      if v_acct is null then
        raise exception 'no account chosen for this payment';
      end if;
      perform public.approve_payment(
        p_payment_id := v_id,
        p_account_code := v_acct,
        p_notes := p_notes
      );
      v_ok := v_ok + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('id', v_id, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('ok', v_ok, 'failed', v_failed, 'errors', v_errors);
end; $function$;

-- --- bulk pay ----------------------------------------------------------------
-- Pays each selected payment: approved general payments (from their approved
-- account) and pending reimbursements (from p_account_code). Skips + reports
-- anything not in a payable state.

create or replace function public.pay_payments_bulk(
  p_ids uuid[],
  p_paid_date date default current_date,
  p_account_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_ok int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if coalesce(current_user_role()::text, '') not in ('owner','partner') then
    raise exception 'only owner or partner can pay payments' using errcode = '42501';
  end if;

  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    begin
      perform public.pay_payment(
        p_payment_id := v_id,
        p_paid_date := p_paid_date,
        p_account_code := p_account_code
      );
      v_ok := v_ok + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('id', v_id, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('ok', v_ok, 'failed', v_failed, 'errors', v_errors);
end; $function$;

grant execute on function public.approve_payments_bulk(uuid[], text, text) to authenticated;
grant execute on function public.pay_payments_bulk(uuid[], date, text) to authenticated;
