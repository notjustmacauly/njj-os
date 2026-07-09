-- =================================================================
-- POS shifts: auto-close at end of day (Manila) if left open.
--
-- Problem: shifts were never auto-closed, so they ran for days/weeks
-- across multiple events, piling up sales and wrecking per-shift and
-- monthly reporting.
--
-- Fix:
--   1. ledger_apply — allow the scheduler (no logged-in user → null role)
--      to post, same pattern as close_expired_pin_shifts.
--   2. _close_pos_shift_core — the real close (expected cash, ledger post
--      per account) dated to the EVENT day (opened_at), not the close
--      moment, so a late/auto close books revenue in the right month.
--   3. close_pos_shift — thin role-gated wrapper over the core.
--   4. auto_close_stale_shifts — closes every shift left open from a
--      previous Manila day, tags them 'end_of_day', notifies owner/partner.
--   5. pg_cron — run it nightly at 20:00 UTC (04:00 Manila).
-- =================================================================

-- 1) Let the scheduler write to the ledger (null role = no JWT = cron/system).
create or replace function public.ledger_apply(
  p_account_code text, p_direction text, p_amount numeric,
  p_ref_type text, p_ref_id uuid default null, p_ref_external_id text default null,
  p_description text default null, p_idempotency_key text default null,
  p_occurred_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_entry_id uuid; v_existing_id uuid;
begin
  if current_user_role() is not null
     and current_user_role() not in ('owner','partner','manager','staff') then
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
end; $function$;

-- 2) Core close (no role gate — gate lives in the public wrappers).
create or replace function public._close_pos_shift_core(
  p_shift_id uuid, p_closing_cash numeric, p_notes text default null, p_auto_reason text default null
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_shift record; v_expected numeric; v_variance numeric;
        v_acct record; v_event_label text; v_posted int := 0; v_occurred timestamptz;
begin
  select * into v_shift from public.pos_shifts where id = p_shift_id;
  if not found then raise exception 'shift not found' using errcode = '23503'; end if;
  if v_shift.closed_at is not null then
    raise exception 'shift already closed' using errcode = '22023';
  end if;

  select coalesce(sum(total), 0) into v_expected
  from public.pos_transactions
  where shift_id = p_shift_id and payment_method = 'Cash' and deleted_at is null;
  v_expected := v_expected + coalesce(v_shift.opening_cash, 0);
  v_variance := p_closing_cash - v_expected;

  update public.pos_shifts
     set closed_at = now(), closing_cash = p_closing_cash,
         auto_closed_reason = coalesce(p_auto_reason, auto_closed_reason),
         notes = case when p_notes is null or p_notes = '' then notes
                      else coalesce(notes || E'\n', '') || p_notes end,
         updated_at = now()
   where id = p_shift_id;

  -- Book revenue on the EVENT day, not the close moment.
  v_occurred := coalesce(v_shift.opened_at, v_shift.shift_date::timestamptz, now());
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
      p_occurred_at := v_occurred
    );
    v_posted := v_posted + 1;
  end loop;

  return jsonb_build_object('shift_id', p_shift_id, 'expected', v_expected,
    'closing_cash', p_closing_cash, 'variance', v_variance, 'ledger_postings', v_posted);
end; $function$;

-- 3) Public manual close — role + staff-ownership gate, then core.
create or replace function public.close_pos_shift(
  p_shift_id uuid, p_closing_cash numeric, p_notes text default null
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_owner uuid;
begin
  if current_user_role() not in ('owner','partner','manager','staff') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  select staff_user_id into v_owner from public.pos_shifts where id = p_shift_id;
  if not found then raise exception 'shift not found' using errcode = '23503'; end if;
  if current_user_role() = 'staff' and v_owner <> auth.uid() then
    raise exception 'cannot close another user''s shift' using errcode = '42501';
  end if;
  return public._close_pos_shift_core(p_shift_id, p_closing_cash, p_notes, null);
end; $function$;

-- 4) Nightly auto-close of shifts left open from a previous Manila day.
create or replace function public.auto_close_stale_shifts()
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_shift record; v_today date; v_count int := 0; v_labels text := '';
        v_expected numeric;
begin
  if current_user_role() is not null and current_user_role() not in ('owner','partner') then
    raise exception 'only owner/partner/scheduler can auto-close shifts' using errcode = '42501';
  end if;
  v_today := (now() at time zone 'Asia/Manila')::date;

  for v_shift in
    select id, external_id, event_name, opening_cash
    from public.pos_shifts
    where closed_at is null and deleted_at is null and shift_date < v_today
    order by shift_date
  loop
    v_expected := coalesce(v_shift.opening_cash, 0)
      + coalesce((select sum(total) from public.pos_transactions
                  where shift_id = v_shift.id and payment_method = 'Cash' and deleted_at is null), 0);
    perform public._close_pos_shift_core(
      v_shift.id, v_expected,
      'Auto-closed at end of day (was left open) — verify the cash count.',
      'end_of_day'
    );
    v_count := v_count + 1;
    v_labels := v_labels || case when v_labels = '' then '' else ', ' end
             || coalesce(v_shift.external_id, nullif(v_shift.event_name, ''), v_shift.id::text);
  end loop;

  if v_count > 0 then
    perform public.notify('pos', 'POS shifts auto-closed',
      v_count || ' shift(s) left open were auto-closed: ' || v_labels || '. Verify the cash counts.',
      '/dashboard/pos/sessions', null, 'owner');
    perform public.notify('pos', 'POS shifts auto-closed',
      v_count || ' shift(s) left open were auto-closed: ' || v_labels || '. Verify the cash counts.',
      '/dashboard/pos/sessions', null, 'partner');
  end if;

  return jsonb_build_object('closed', v_count, 'shifts', v_labels, 'manila_date', v_today);
end; $function$;

revoke all on function public.auto_close_stale_shifts() from public;
grant execute on function public.auto_close_stale_shifts() to authenticated;

-- 5) Schedule it nightly at 20:00 UTC = 04:00 Manila.
create extension if not exists pg_cron;
select cron.schedule('pos-auto-close-eod', '0 20 * * *', 'select public.auto_close_stale_shifts();');
