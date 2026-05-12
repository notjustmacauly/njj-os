-- Revert per-transaction ledger posting in create_pos_transaction.
-- Ledger entries are now posted as per-account rollups by close_pos_shift,
-- so per-cup sales don't flood the Revenue view.

create or replace function public.create_pos_transaction(
  p_idempotency_key text,
  p_payment_method  text,
  p_shift_id        uuid        default null,
  p_account_code    text        default null,
  p_event_name      text        default null,
  p_transaction_at  timestamptz default now(),
  p_discount        numeric     default 0,
  p_staff_name      text        default null,
  p_notes           text        default null,
  p_items           jsonb       default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn_id      uuid;
  v_existing_id uuid;
  v_method_enum public.pos_payment_method;
  v_account     text;
  v_event       text;
  v_item        jsonb;
begin
  if current_user_role() not in ('admin','manager','ops','staff') then
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.pos_transaction_items (
      transaction_id, item_type, sku_code, ticket_type_code, label,
      qty, unit_price, batch_id, notes
    ) values (
      v_txn_id,
      (v_item->>'item_type')::public.pos_item_type,
      v_item->>'sku_code',
      v_item->>'ticket_type_code',
      v_item->>'label',
      (v_item->>'qty')::int,
      (v_item->>'unit_price')::numeric,
      nullif(v_item->>'batch_id', '')::uuid,
      v_item->>'notes'
    );
  end loop;

  -- NOTE: no ledger_apply here. Ledger is posted by close_pos_shift as
  -- one rollup entry per account_code used during the shift.
  return v_txn_id;
end; $$;


-- close_pos_shift: post per-account rollup ledger entries on close.

create or replace function public.close_pos_shift(
  p_shift_id      uuid,
  p_closing_cash  numeric,
  p_notes         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift          record;
  v_expected       numeric;
  v_variance       numeric;
  v_acct           record;
  v_event_label    text;
  v_posted_count   int := 0;
begin
  if current_user_role() not in ('admin','manager','ops','staff') then
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
    set closed_at    = now(),
        closing_cash = p_closing_cash,
        notes        = case when p_notes is null or p_notes = ''
                            then notes
                            else coalesce(notes || E'\n', '') || p_notes end
    where id = p_shift_id;

  v_event_label := coalesce(nullif(v_shift.event_name, ''), 'POS Shift')
                || ' · '
                || to_char(coalesce(v_shift.opened_at, now())::date, 'YYYY-MM-DD');

  for v_acct in
    select account_code, sum(total) as total_amount
    from public.pos_transactions
    where shift_id = p_shift_id and deleted_at is null
    group by account_code
    having sum(total) > 0
  loop
    perform public.ledger_apply(
      p_account_code    := v_acct.account_code,
      p_direction       := 'in',
      p_amount          := v_acct.total_amount,
      p_ref_type        := 'pos_shift',
      p_ref_id          := p_shift_id,
      p_description     := 'POS · ' || v_event_label || ' · ' || v_acct.account_code,
      p_idempotency_key := 'pos-shift-' || p_shift_id::text || '-' || v_acct.account_code,
      p_occurred_at     := now()
    );
    v_posted_count := v_posted_count + 1;
  end loop;

  return jsonb_build_object(
    'shift_id',        p_shift_id,
    'expected',        v_expected,
    'closing_cash',    p_closing_cash,
    'variance',        v_variance,
    'ledger_postings', v_posted_count
  );
end; $$;
