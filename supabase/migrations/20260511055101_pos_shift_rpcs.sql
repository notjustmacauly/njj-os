-- open_pos_shift — creates a new shift owned by the current user.
-- Prevents opening if user already has an open shift.
create or replace function public.open_pos_shift(
  p_event_name        text,
  p_shift_date        date    default current_date,
  p_opening_cash      numeric default 0,
  p_staff_name        text    default null,
  p_default_batch_pcl uuid    default null,
  p_default_batch_acg uuid    default null,
  p_default_batch_wpm uuid    default null,
  p_notes             text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_shift_id uuid;
begin
  if current_user_role() not in ('admin','manager','ops','staff') then
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

comment on function public.open_pos_shift is
  'Opens a new POS shift for the current user. Errors if the user already has an open shift.';

revoke all on function public.open_pos_shift(text, date, numeric, text, uuid, uuid, uuid, text) from public;
grant  execute on function public.open_pos_shift(text, date, numeric, text, uuid, uuid, uuid, text) to authenticated;

-- close_pos_shift — closes a shift, computes variance vs expected cash.
-- NOTE: this initial version was superseded by 20260511122751_pos_ledger_rollup_redesign
-- which adds per-account ledger rollup posting at close time.
create or replace function public.close_pos_shift(
  p_shift_id     uuid,
  p_closing_cash numeric,
  p_notes        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shift     record;
  v_expected  numeric;
  v_variance  numeric;
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
  where shift_id = p_shift_id
    and payment_method = 'Cash'
    and deleted_at is null;
  v_expected := v_expected + v_shift.opening_cash;
  v_variance := p_closing_cash - v_expected;

  update public.pos_shifts
    set closed_at    = now(),
        closing_cash = p_closing_cash,
        notes        = case when p_notes is null or p_notes = ''
                            then notes
                            else coalesce(notes || E'\n', '') || p_notes end
    where id = p_shift_id;

  return jsonb_build_object(
    'shift_id',     p_shift_id,
    'expected',     v_expected,
    'closing_cash', p_closing_cash,
    'variance',     v_variance
  );
end; $$;

comment on function public.close_pos_shift is
  'Closes a POS shift, computes variance = closing_cash - (opening_cash + cash payments). Returns summary jsonb.';

revoke all on function public.close_pos_shift(uuid, numeric, text) from public;
grant  execute on function public.close_pos_shift(uuid, numeric, text) to authenticated;

-- force_close_pos_shift — admin-only override to close any open shift.
create or replace function public.force_close_pos_shift(
  p_shift_id      uuid,
  p_closing_cash  numeric,
  p_reason        text default 'force-closed by admin'
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if current_user_role() <> 'admin' then
    raise exception 'only admin can force-close shifts' using errcode = '42501';
  end if;
  return public.close_pos_shift(p_shift_id, p_closing_cash, p_reason);
end; $$;

comment on function public.force_close_pos_shift is
  'Admin-only: close any shift regardless of owner. Wraps close_pos_shift with reason note.';

revoke all on function public.force_close_pos_shift(uuid, numeric, text) from public;
grant  execute on function public.force_close_pos_shift(uuid, numeric, text) to authenticated;
