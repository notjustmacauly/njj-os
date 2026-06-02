-- "Releases" = non-sale stock outflows (marketing give-aways, customer
-- replacements, wastage/damage). These deduct inventory but must NOT count as
-- sales/revenue. The deductions + deduction_items tables already exist and the
-- inventory_summary view already subtracts them — this migration adds:
--   1) a 'replacement' deduction type,
--   2) an idempotency_key,
--   3) a create_deduction() RPC mirroring create_order().
--
-- Note: existing RLS already grants owner/partner/manager — "all read
-- deductions" (current_user_role() is not null) and "operational manages
-- deductions" (owner/partner/manager). No policy changes needed.

-- 1) New type for customer replacements (distinct from comps/wastage).
alter type public.deduction_type add value if not exists 'replacement';

-- 2) Idempotency key so a double-tapped "Record release" can't create two rows.
alter table public.deductions
  add column if not exists idempotency_key text unique;

-- 3) create_deduction() RPC — atomic header + line items, with idempotency.
--   const { data: id } = await supabase.rpc('create_deduction', {
--     p_idempotency_key: crypto.randomUUID(),
--     p_type: 'marketing',
--     p_recipient: 'Influencer X',
--     p_deduction_date: '2026-06-02',
--     p_notes: '...',
--     p_items: [{ sku_code: 'PCL', qty: 6, batch_id: '...' }]
--   });
create or replace function public.create_deduction(
  p_idempotency_key text,
  p_type            text,
  p_recipient       text    default null,
  p_deduction_date  date    default current_date,
  p_notes           text    default null,
  p_items           jsonb   default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_existing_id uuid;
  v_item        jsonb;
  v_sku_code    text;
  v_qty         integer;
  v_batch_id    uuid;
  v_batch_sku   text;
begin
  if current_user_role() not in ('owner','partner','manager','admin') then
    raise exception 'insufficient privileges to record releases' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.deductions where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'a release needs at least one line item' using errcode = '22023';
  end if;

  insert into public.deductions (
    idempotency_key, type, recipient, deduction_date, notes, created_by_user_id
  ) values (
    p_idempotency_key, p_type::public.deduction_type, p_recipient, p_deduction_date, p_notes, auth.uid()
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku_code := v_item->>'sku_code';
    v_qty      := (v_item->>'qty')::int;
    v_batch_id := nullif(v_item->>'batch_id', '')::uuid;

    if v_sku_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid release item: %', v_item using errcode = '22023';
    end if;

    -- If a batch is named, it must be a finalized batch for that same SKU.
    if v_batch_id is not null then
      select sku_code into v_batch_sku from public.batches
       where id = v_batch_id and status = 'finalized' and deleted_at is null;
      if v_batch_sku is null then
        raise exception 'batch % is not a finalized batch', v_batch_id using errcode = '23503';
      end if;
      if v_batch_sku <> v_sku_code then
        raise exception 'batch % is for SKU %, line item is %',
          v_batch_id, v_batch_sku, v_sku_code using errcode = '22023';
      end if;
    end if;

    insert into public.deduction_items (deduction_id, sku_code, qty, batch_id, notes)
      values (v_id, v_sku_code, v_qty, v_batch_id, nullif(v_item->>'notes', ''));
  end loop;

  -- deduction_items trigger has refreshed the parent's maintained totals.
  return v_id;
end; $$;

revoke all on function public.create_deduction(text, text, text, date, text, jsonb) from public;
grant execute on function public.create_deduction(text, text, text, date, text, jsonb) to authenticated;
