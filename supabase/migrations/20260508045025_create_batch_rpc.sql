-- Add idempotency_key column to batches (mirrors orders pattern)
alter table public.batches
  add column if not exists idempotency_key text unique;

-- create_batch() RPC — atomic batch + inputs creation
create or replace function public.create_batch(
  p_idempotency_key text,
  p_sku_code        text,
  p_batch_date      date     default current_date,
  p_units_planned   integer  default 0,
  p_units_produced  integer  default 0,
  p_wastage         integer  default 0,
  p_ph              numeric  default null,
  p_brix            numeric  default null,
  p_qc_passed       boolean  default null,
  p_qc_notes        text     default null,
  p_staff_name      text     default null,
  p_notes           text     default null,
  p_inputs          jsonb    default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id    uuid;
  v_existing_id uuid;
  v_input       jsonb;
begin
  if current_user_role() not in ('admin','manager','ops') then
    raise exception 'insufficient privileges to create batches' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.batches where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.batches (
    idempotency_key, sku_code, batch_date,
    units_planned, units_produced, wastage,
    ph, brix, qc_passed, qc_notes,
    staff_name, staff_user_id, notes
  ) values (
    p_idempotency_key, p_sku_code, p_batch_date,
    coalesce(p_units_planned, 0), coalesce(p_units_produced, 0), coalesce(p_wastage, 0),
    p_ph, p_brix, p_qc_passed, p_qc_notes,
    p_staff_name, auth.uid(), p_notes
  ) returning id into v_batch_id;

  for v_input in select * from jsonb_array_elements(p_inputs) loop
    insert into public.batch_inputs (
      batch_id, ingredient_code, qty_used, unit, cost_per_unit
    ) values (
      v_batch_id,
      v_input->>'ingredient_code',
      (v_input->>'qty_used')::numeric,
      v_input->>'unit',
      coalesce((v_input->>'cost_per_unit')::numeric, 0)
    );
  end loop;

  return v_batch_id;
end;
$$;

comment on function public.create_batch is
  'Atomic batch creation with ingredients. Returns existing batch_id if idempotency_key already used. Inputs: jsonb array of {ingredient_code, qty_used, unit, cost_per_unit}.';

revoke all on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb) from public;
grant  execute on function public.create_batch(text, text, date, integer, integer, integer, numeric, numeric, boolean, text, text, text, jsonb) to authenticated;
