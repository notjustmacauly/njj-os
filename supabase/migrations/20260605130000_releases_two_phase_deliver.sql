-- =================================================================
-- Releases (deductions) become a two-phase flow, mirroring Orders:
--   1) Create in advance as PENDING — captures type/recipient/items
--      (SKU + qty). No batch, so NO stock is deducted yet.
--   2) "Complete delivery" assigns a batch to each line via
--      deliver_deduction(), which is when stock is actually deducted
--      (inventory_summary only nets deduction_items that have a batch).
--
-- Stock is deducted purely through deduction_items.batch_id, so the
-- "pending => no batch => no stock moved" invariant holds.
-- =================================================================

-- 1) status column ------------------------------------------------
alter table public.deductions
  add column if not exists status text not null default 'pending';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deductions_status_check') then
    alter table public.deductions
      add constraint deductions_status_check check (status in ('pending','delivered'));
  end if;
end $$;

comment on column public.deductions.status is
  'pending = created in advance, no batch assigned, no stock deducted. delivered = batch assigned per line, stock deducted.';

-- 2) backfill existing rows: a release whose every item already has a
--    batch has effectively been delivered; anything else is pending.
update public.deductions d
   set status = 'delivered'
 where d.deleted_at is null
   and exists (select 1 from public.deduction_items di where di.deduction_id = d.id)
   and not exists (
     select 1 from public.deduction_items di
      where di.deduction_id = d.id and di.batch_id is null
   );

-- 3) create_deduction: always PENDING, never assigns a batch at create
create or replace function public.create_deduction(
  p_idempotency_key text,
  p_type text,
  p_recipient text default null,
  p_deduction_date date default current_date,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id          uuid;
  v_existing_id uuid;
  v_item        jsonb;
  v_sku_code    text;
  v_qty         integer;
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
    idempotency_key, type, recipient, deduction_date, notes, created_by_user_id, status
  ) values (
    p_idempotency_key, p_type::public.deduction_type, p_recipient, p_deduction_date, p_notes, auth.uid(), 'pending'
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku_code := v_item->>'sku_code';
    v_qty      := (v_item->>'qty')::int;

    if v_sku_code is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid release item: %', v_item using errcode = '22023';
    end if;

    -- Batch is intentionally NOT taken here: it is chosen at delivery.
    insert into public.deduction_items (deduction_id, sku_code, qty, batch_id, notes)
      values (v_id, v_sku_code, v_qty, null, nullif(v_item->>'notes', ''));
  end loop;

  return v_id;
end; $function$;

revoke all on function public.create_deduction(text, text, text, date, text, jsonb) from public;
grant execute on function public.create_deduction(text, text, text, date, text, jsonb) to authenticated;

-- 4) deliver_deduction: assign a batch to every line, deduct stock,
--    flip to delivered. owner/partner may override the stock guard to
--    close out against depleted historical batches (same as Orders).
create or replace function public.deliver_deduction(
  p_deduction_id   uuid,
  p_allocations    jsonb default '[]'::jsonb,   -- [{ item_id, batch_id }]
  p_allow_override boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role      app_role;
  v_ded       record;
  v_alloc     jsonb;
  v_item_id   uuid;
  v_batch_id  uuid;
  v_di        record;
  v_batch     record;
  v_override  boolean;
  v_unbatched int;
begin
  v_role := current_user_role();
  if v_role not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to deliver releases' using errcode = '42501';
  end if;
  v_override := coalesce(p_allow_override, false) and v_role in ('owner','partner');

  select * into v_ded from public.deductions
   where id = p_deduction_id and deleted_at is null;
  if not found then
    raise exception 'release not found' using errcode = '23503';
  end if;
  if v_ded.status = 'delivered' then
    raise exception 'release is already delivered' using errcode = '22023';
  end if;

  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'pick a batch for each line to complete delivery' using errcode = '22023';
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_item_id  := nullif(v_alloc->>'item_id', '')::uuid;
    v_batch_id := nullif(v_alloc->>'batch_id', '')::uuid;

    if v_item_id is null or v_batch_id is null then
      raise exception 'each allocation needs an item_id and a batch_id: %', v_alloc using errcode = '22023';
    end if;

    select * into v_di from public.deduction_items
     where id = v_item_id and deduction_id = p_deduction_id;
    if not found then
      raise exception 'line % is not part of this release', v_item_id using errcode = '23503';
    end if;

    -- Live remaining for the batch (units produced minus everything drawn
    -- so far: orders, POS, other deductions). Reads deduction_items live,
    -- so multiple lines drawing the same batch accumulate correctly.
    select b.sku_code, b.status, b.deleted_at,
           (b.units_produced
              - coalesce((select sum(oi.qty) from public.order_items oi
                           where oi.batch_id = b.id and not exists (
                             select 1 from public.order_item_batch_allocations a where a.order_item_id = oi.id)), 0)
              - coalesce((select sum(a.qty) from public.order_item_batch_allocations a where a.batch_id = b.id), 0)
              - coalesce((select sum(pi.qty) from public.pos_transaction_items pi
                           where pi.batch_id = b.id and pi.item_type = 'juice'::pos_item_type), 0)
              - coalesce((select sum(di.qty) from public.deduction_items di where di.batch_id = b.id), 0)
           )::integer as remaining
      into v_batch
      from public.batches b
     where b.id = v_batch_id;

    if not found then
      raise exception 'batch % not found', v_batch_id using errcode = '23503';
    end if;
    if v_batch.deleted_at is not null then
      raise exception 'batch % is deleted', v_batch_id using errcode = '22023';
    end if;
    if v_batch.status <> 'finalized' then
      raise exception 'batch % is not finalized (status = %)', v_batch_id, v_batch.status using errcode = '22023';
    end if;
    if v_batch.sku_code <> v_di.sku_code then
      raise exception 'batch % is for SKU %, this line is %',
        v_batch_id, v_batch.sku_code, v_di.sku_code using errcode = '22023';
    end if;
    if v_batch.remaining < v_di.qty and not v_override then
      raise exception 'batch % only has % left, cannot release % (use override to close against an old batch)',
        v_batch_id, v_batch.remaining, v_di.qty using errcode = '22023';
    end if;

    update public.deduction_items set batch_id = v_batch_id where id = v_item_id;
  end loop;

  -- Every line must end up with a batch for the release to be delivered.
  select count(*) into v_unbatched
    from public.deduction_items
   where deduction_id = p_deduction_id and batch_id is null;
  if v_unbatched > 0 then
    raise exception 'every line item must be assigned a batch to complete delivery (% missing)', v_unbatched
      using errcode = '22023';
  end if;

  update public.deductions
     set status = 'delivered', updated_at = now()
   where id = p_deduction_id;

  return p_deduction_id;
end; $function$;

revoke all on function public.deliver_deduction(uuid, jsonb, boolean) from public;
grant execute on function public.deliver_deduction(uuid, jsonb, boolean) to authenticated;
