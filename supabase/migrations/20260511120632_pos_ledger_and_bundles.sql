-- ============================================================
-- Patch 1: create_pos_transaction now posts a ledger entry
-- atomically with the transaction. Fixes the gap where POS
-- sales weren't reflected in account_balances.
-- NOTE: Superseded by 20260511122751_pos_ledger_rollup_redesign,
-- which removes per-txn posting in favor of per-shift rollups.
-- This file is kept for historical accuracy.
-- ============================================================
create or replace function public.create_pos_transaction(
  p_idempotency_key  text,
  p_payment_method   text,
  p_shift_id         uuid    default null,
  p_account_code     text    default null,
  p_event_name       text    default null,
  p_transaction_at   timestamptz default now(),
  p_discount         numeric default 0,
  p_staff_name       text    default null,
  p_notes            text    default null,
  p_items            jsonb   default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_txn_id uuid; v_existing_id uuid;
  v_method_enum public.pos_payment_method;
  v_account text; v_event text; v_item jsonb;
  v_total numeric;
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

  select total into v_total from public.pos_transactions where id = v_txn_id;

  if v_total > 0 then
    perform public.ledger_apply(
      p_account_code    := v_account,
      p_direction       := 'in',
      p_amount          := v_total,
      p_ref_type        := 'pos_transaction',
      p_ref_id          := v_txn_id,
      p_ref_external_id := (select external_id from public.pos_transactions where id = v_txn_id),
      p_description     := 'POS sale' || case when v_event is not null then ' · ' || v_event else '' end,
      p_idempotency_key := 'pos-txn-' || v_txn_id::text,
      p_occurred_at     := p_transaction_at
    );
  end if;

  return v_txn_id;
end; $$;

comment on function public.create_pos_transaction is
  'Atomic POS sale: writes transaction + items. Ledger posting handled by close_pos_shift as per-account rollup.';


-- ============================================================
-- Patch 2: pos_bundles table — fixed-price multi-can sets.
-- ============================================================
create table if not exists public.pos_bundles (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  name                  text not null,
  emoji                 text,
  price                 numeric(12,2) not null check (price >= 0),
  total_cans            integer not null check (total_cans > 0),
  is_flavor_pickable    boolean not null default true,
  fixed_breakdown       jsonb,
  sort_order            integer not null default 0,
  is_active             boolean not null default true,
  notes                 text,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint pos_bundles_fixed_has_breakdown check (
    is_flavor_pickable or fixed_breakdown is not null
  )
);

comment on table public.pos_bundles is
  'Fixed-price multi-can bundles for POS. Pickable bundles let staff pick the flavor mix at sale time; non-pickable use the fixed_breakdown jsonb.';

create index if not exists idx_pos_bundles_active on public.pos_bundles (sort_order)
  where is_active and deleted_at is null;

drop trigger if exists pos_bundles_set_updated_at on public.pos_bundles;
create trigger pos_bundles_set_updated_at before update on public.pos_bundles
  for each row execute function public.set_updated_at();

drop trigger if exists pos_bundles_audit on public.pos_bundles;
create trigger pos_bundles_audit after insert or update or delete on public.pos_bundles
  for each row execute function public.audit_trigger();

alter table public.pos_bundles enable row level security;

drop policy if exists "all read pos_bundles" on public.pos_bundles;
create policy "all read pos_bundles" on public.pos_bundles for select to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "admin+manager manage pos_bundles" on public.pos_bundles;
create policy "admin+manager manage pos_bundles" on public.pos_bundles for all to authenticated
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

insert into public.pos_bundles (code, name, emoji, price, total_cans, is_flavor_pickable, sort_order) values
  ('BUNDLE_4PK', 'Mix-and-match 4-pack', '📦', 700, 4, true, 100)
on conflict (code) do nothing;
