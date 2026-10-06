-- Let the restricted `marketing` role (Alex & Chrissia) SUBMIT payment and
-- reimbursement requests into the existing payments pipeline — without seeing
-- the finance queue. They can see only their OWN requests, and get notified
-- when a request is paid or declined.

-- 1. Allow marketing to submit reimbursement + general payment requests.
--    (Not transfers.) Approve/pay stays owner/partner as before.
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
    requested_by_user_id, requested_by_name, notes
  ) values (
    p_idempotency_key, p_type::public.payment_type, p_purpose, p_payee, p_category, p_amount,
    p_account_code, p_transfer_to_account_code, 'pending',
    auth.uid(), p_requested_by_name, p_notes
  ) returning id into v_id;

  return v_id;
end; $$;

-- 2. A requester can read their OWN payments (any type) — powers the self-only
--    "My requests" list. Never exposes anyone else's.
drop policy if exists "requester reads own payments" on public.payments;
create policy "requester reads own payments" on public.payments for select to authenticated
  using (requested_by_user_id = auth.uid() and deleted_at is null);

-- 3. Notify the requester when their request is settled (paid or declined).
create or replace function public.notify_requester_on_payment_settled()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_label text; v_amt text;
begin
  if new.requested_by_user_id is null then return new; end if;
  if new.requested_by_user_id = auth.uid() then return new; end if;  -- don't self-notify
  v_label := case when new.type = 'reimbursement' then 'reimbursement' else 'payment' end;
  v_amt := '₱' || to_char(new.amount, 'FM999,999,990.00');
  if new.status = 'paid' then
    perform public.notify('payment', 'Your ' || v_label || ' was paid',
      'Your ' || v_label || ' of ' || v_amt || ' (' || coalesce(new.purpose,'request') || ') was paid.',
      '/dashboard/requests', new.requested_by_user_id, null);
  elsif new.status = 'cancelled' then
    perform public.notify('payment', 'Your ' || v_label || ' was declined',
      'Your ' || v_label || ' of ' || v_amt || ' (' || coalesce(new.purpose,'request') || ') was declined'
        || coalesce(' — ' || nullif(trim(new.cancel_reason),''), '') || '.',
      '/dashboard/requests', new.requested_by_user_id, null);
  end if;
  return new;
end; $$;

drop trigger if exists notify_requester_on_payment_settled_trg on public.payments;
create trigger notify_requester_on_payment_settled_trg
  after update on public.payments
  for each row
  when (old.status is distinct from new.status and new.status in ('paid','cancelled'))
  execute function public.notify_requester_on_payment_settled();
