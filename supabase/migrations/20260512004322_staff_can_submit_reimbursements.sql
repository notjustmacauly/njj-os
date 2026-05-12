-- Allow staff to submit reimbursement requests (their own out-of-pocket
-- expenses they want paid back). Other payment types (general, transfer)
-- continue to require ops or higher. Staff can read only their own
-- reimbursements.

-- 1) Relax the role check in create_payment_request for reimbursements.
create or replace function public.create_payment_request(
  p_idempotency_key            text,
  p_purpose                    text,
  p_amount                     numeric,
  p_account_code               text,
  p_type                       text default 'general',
  p_payee                      text default null,
  p_category                   text default null,
  p_transfer_to_account_code   text default null,
  p_notes                      text default null,
  p_requested_by_name          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_existing_id uuid;
  v_role        public.app_role := current_user_role();
begin
  if p_type = 'reimbursement' then
    if v_role not in ('admin','manager','ops','staff') then
      raise exception 'insufficient privileges' using errcode = '42501';
    end if;
  elsif p_type = 'transfer' then
    if v_role not in ('admin','manager') then
      raise exception 'only admin or manager can request transfers' using errcode = '42501';
    end if;
  else
    if v_role not in ('admin','manager','ops') then
      raise exception 'insufficient privileges' using errcode = '42501';
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

-- 2) Replace the INSERT RLS policy so staff can insert reimbursements they own.
drop policy if exists "ops+ create payment requests" on public.payments;

create policy "tiered create payments"
on public.payments
for insert
to authenticated
with check (
  status = 'pending'::public.payment_request_status
  and (
    (type = 'general'::public.payment_type
      and current_user_role() = any (array['admin','manager','ops']::public.app_role[]))
    or (type = 'transfer'::public.payment_type
      and current_user_role() = any (array['admin','manager']::public.app_role[]))
    or (type = 'reimbursement'::public.payment_type
      and (
        current_user_role() = any (array['admin','manager','ops']::public.app_role[])
        or (current_user_role() = 'staff'::public.app_role and requested_by_user_id = auth.uid())
      )
    )
  )
);

-- 3) Allow staff to read their own reimbursement requests.
create policy "staff read own reimbursements"
on public.payments
for select
to authenticated
using (
  current_user_role() = 'staff'::public.app_role
  and type = 'reimbursement'::public.payment_type
  and requested_by_user_id = auth.uid()
  and deleted_at is null
);

-- 4) Allow staff to cancel their own pending reimbursements.
create policy "staff cancel own pending reimbursements"
on public.payments
for update
to authenticated
using (
  current_user_role() = 'staff'::public.app_role
  and type = 'reimbursement'::public.payment_type
  and requested_by_user_id = auth.uid()
  and status = 'pending'::public.payment_request_status
)
with check (
  current_user_role() = 'staff'::public.app_role
  and type = 'reimbursement'::public.payment_type
  and requested_by_user_id = auth.uid()
  and status in ('pending'::public.payment_request_status, 'cancelled'::public.payment_request_status)
);
