-- ============================================================
-- NJJ OS v2 — Migration 6: POS (Point of Sale)
-- ============================================================
--   pos_shifts            — booth shift session (open / close, cash float)
--   pos_transactions      — single sale at a booth (parent)
--   pos_transaction_items — line items per sale (juice / cup / water / ticket / other)
--   create_pos_transaction() RPC — atomic write with idempotency
--
-- Design choices mirror Orders:
-- - Idempotency keys prevent double-tap duplicates at the DB level.
-- - Maintained columns on pos_transactions (pcl/acg/wpm qty, cup totals,
--   ticket count, subtotal, total) updated by trigger from items.
-- - pos_shifts is optional (nullable on pos_transactions) so we don't break
--   ad-hoc sales, but normal flow is open-shift → sell → close-shift.
-- - Tickets table + ticket-row creation comes in migration 7. For now POS
--   items can have item_type='ticket' but individual ticket records aren't
--   spawned yet.
-- ============================================================

-- ── enums ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pos_item_type') then
    create type public.pos_item_type as enum ('juice','cup_sm','cup_lg','water','ticket','other');
  end if;
  if not exists (select 1 from pg_type where typname = 'pos_payment_method') then
    create type public.pos_payment_method as enum ('Cash','GCash','Bank Transfer','Xendit','Other');
  end if;
end$$;

-- ── pos_shifts ──────────────────────────────────────────────
create sequence if not exists public.pos_shifts_external_id_seq start 1;

create table if not exists public.pos_shifts (
  id              uuid primary key default gen_random_uuid(),
  external_id     text unique,                                                   -- 'SHIFT-260505-001'
  shift_date      date not null default current_date,
  event_name      text,                                                          -- e.g. 'Saturday Market', 'Total Tuesday'
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,                                                   -- null = shift still open
  opening_cash    numeric(12,2) not null default 0 check (opening_cash >= 0),    -- float at start
  closing_cash    numeric(12,2) check (closing_cash is null or closing_cash >= 0), -- count at end
  staff_name      text,                                                          -- display
  staff_user_id   uuid references auth.users(id) on delete set null,
  default_batch_pcl uuid references public.batches(id) on delete set null,       -- which batch cans come from for the shift
  default_batch_acg uuid references public.batches(id) on delete set null,
  default_batch_wpm uuid references public.batches(id) on delete set null,
  notes           text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pos_shifts_close_after_open check (closed_at is null or closed_at >= opened_at)
);

comment on table public.pos_shifts is
  'A booth shift session. Tracks open/close times, cash float, who staffed it, and default batch refs for inventory deduction. Closing requires closing_cash for reconciliation.';

create index if not exists idx_pos_shifts_open       on public.pos_shifts (closed_at) where closed_at is null and deleted_at is null;
create index if not exists idx_pos_shifts_date       on public.pos_shifts (shift_date desc) where deleted_at is null;
create index if not exists idx_pos_shifts_event_date on public.pos_shifts (event_name, shift_date desc) where deleted_at is null;

drop trigger if exists pos_shifts_set_updated_at on public.pos_shifts;
create trigger pos_shifts_set_updated_at
  before update on public.pos_shifts
  for each row execute function public.set_updated_at();

drop trigger if exists pos_shifts_audit on public.pos_shifts;
create trigger pos_shifts_audit
  after insert or update or delete on public.pos_shifts
  for each row execute function public.audit_trigger();

-- Auto-assign external_id (SHIFT-yymmdd-NNN)
create or replace function public.assign_pos_shift_external_id()
returns trigger
language plpgsql
as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.shift_date, current_date), 'YYMMDD');
    new.external_id := 'SHIFT-' || v_date_part || '-' ||
      lpad(nextval('public.pos_shifts_external_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists pos_shifts_assign_external_id on public.pos_shifts;
create trigger pos_shifts_assign_external_id
  before insert on public.pos_shifts
  for each row execute function public.assign_pos_shift_external_id();

alter table public.pos_shifts enable row level security;

drop policy if exists "all read pos_shifts" on public.pos_shifts;
create policy "all read pos_shifts"
  on public.pos_shifts for select
  to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "ops+ manage pos_shifts" on public.pos_shifts;
create policy "ops+ manage pos_shifts"
  on public.pos_shifts for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops','staff'))
  with check (current_user_role() in ('admin','manager','ops','staff'));

-- ── pos_transactions ────────────────────────────────────────
create sequence if not exists public.pos_transactions_external_id_seq start 1;

create table if not exists public.pos_transactions (
  id                uuid primary key default gen_random_uuid(),
  external_id       text unique,                                                 -- 'POS-260505-001'
  idempotency_key   text unique,
  shift_id          uuid references public.pos_shifts(id) on delete set null,    -- the shift this sale belongs to
  transaction_at    timestamptz not null default now(),
  event_name        text,                                                        -- denormalized from shift; falls back if no shift
  payment_method    public.pos_payment_method not null,
  account_code      text not null references public.accounts(code),              -- where the money lands
  -- Maintained columns: do not write directly. Updated by trigger from items.
  pcl_qty           integer not null default 0,
  acg_qty           integer not null default 0,
  wpm_qty           integer not null default 0,
  cup_sm_qty        integer not null default 0,
  cup_lg_qty        integer not null default 0,
  water_qty         integer not null default 0,
  ticket_qty        integer not null default 0,
  subtotal          numeric(12,2) not null default 0,
  discount          numeric(12,2) not null default 0 check (discount >= 0),
  total             numeric(12,2) not null default 0,
  staff_name        text,
  staff_user_id     uuid references auth.users(id) on delete set null,
  notes             text,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.pos_transactions is
  'A single POS sale at the booth. qty/subtotal/total maintained by trigger from pos_transaction_items.';

create index if not exists idx_pos_transactions_shift on public.pos_transactions (shift_id) where deleted_at is null;
create index if not exists idx_pos_transactions_at    on public.pos_transactions (transaction_at desc) where deleted_at is null;
create index if not exists idx_pos_transactions_event on public.pos_transactions (event_name, transaction_at desc) where deleted_at is null;
create index if not exists idx_pos_transactions_account on public.pos_transactions (account_code) where deleted_at is null;

drop trigger if exists pos_transactions_set_updated_at on public.pos_transactions;
create trigger pos_transactions_set_updated_at
  before update on public.pos_transactions
  for each row execute function public.set_updated_at();

drop trigger if exists pos_transactions_audit on public.pos_transactions;
create trigger pos_transactions_audit
  after insert or update or delete on public.pos_transactions
  for each row execute function public.audit_trigger();

create or replace function public.assign_pos_transaction_external_id()
returns trigger
language plpgsql
as $$
declare v_date_part text;
begin
  if new.external_id is null or new.external_id = '' then
    v_date_part := to_char(coalesce(new.transaction_at::date, current_date), 'YYMMDD');
    new.external_id := 'POS-' || v_date_part || '-' ||
      lpad(nextval('public.pos_transactions_external_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists pos_transactions_assign_external_id on public.pos_transactions;
create trigger pos_transactions_assign_external_id
  before insert on public.pos_transactions
  for each row execute function public.assign_pos_transaction_external_id();

alter table public.pos_transactions enable row level security;

drop policy if exists "all read pos_transactions" on public.pos_transactions;
create policy "all read pos_transactions"
  on public.pos_transactions for select
  to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "all roles write pos_transactions" on public.pos_transactions;
create policy "all roles write pos_transactions"
  on public.pos_transactions for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops','staff'))
  with check (current_user_role() in ('admin','manager','ops','staff'));

-- ── pos_transaction_items ───────────────────────────────────
create table if not exists public.pos_transaction_items (
  id                  uuid primary key default gen_random_uuid(),
  transaction_id      uuid not null references public.pos_transactions(id) on delete cascade,
  item_type           public.pos_item_type not null,
  sku_code            text references public.skus(code),                          -- juice items
  ticket_type_code    text references public.ticket_types(code),                  -- ticket items
  label               text,                                                       -- free-form fallback (cups, water, "other")
  qty                 integer not null check (qty > 0),
  unit_price          numeric(12,2) not null check (unit_price >= 0),
  subtotal            numeric(12,2) generated always as (qty * unit_price) stored,
  batch_id            uuid references public.batches(id) on delete set null,      -- juice items: which batch
  notes               text,
  created_at          timestamptz not null default now(),
  -- Type-specific consistency: juice items must have sku_code; tickets must have ticket_type_code
  constraint pos_items_juice_has_sku    check (item_type <> 'juice'  or sku_code is not null),
  constraint pos_items_ticket_has_type  check (item_type <> 'ticket' or ticket_type_code is not null)
);

comment on table public.pos_transaction_items is
  'Line items for a POS transaction. Polymorphic by item_type — juice/ticket items reference catalog tables; cups/water/other use the label text.';

create index if not exists idx_pos_items_txn   on public.pos_transaction_items (transaction_id);
create index if not exists idx_pos_items_sku   on public.pos_transaction_items (sku_code) where sku_code is not null;
create index if not exists idx_pos_items_batch on public.pos_transaction_items (batch_id) where batch_id is not null;

drop trigger if exists pos_items_audit on public.pos_transaction_items;
create trigger pos_items_audit
  after insert or update or delete on public.pos_transaction_items
  for each row execute function public.audit_trigger();

alter table public.pos_transaction_items enable row level security;

drop policy if exists "all read pos_items" on public.pos_transaction_items;
create policy "all read pos_items"
  on public.pos_transaction_items for select
  to authenticated
  using (current_user_role() is not null);

drop policy if exists "all roles write pos_items" on public.pos_transaction_items;
create policy "all roles write pos_items"
  on public.pos_transaction_items for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops','staff'))
  with check (current_user_role() in ('admin','manager','ops','staff'));

-- ── recompute_pos_totals(transaction_id) ────────────────────
create or replace function public.recompute_pos_totals(p_txn_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal   numeric(12,2);
  v_pcl        integer;
  v_acg        integer;
  v_wpm        integer;
  v_cup_sm     integer;
  v_cup_lg     integer;
  v_water      integer;
  v_tickets    integer;
  v_discount   numeric(12,2);
  v_total      numeric(12,2);
begin
  select
    coalesce(sum(subtotal), 0),
    coalesce(sum(qty) filter (where item_type = 'juice'  and sku_code = 'PCL'), 0),
    coalesce(sum(qty) filter (where item_type = 'juice'  and sku_code = 'ACG'), 0),
    coalesce(sum(qty) filter (where item_type = 'juice'  and sku_code = 'WPM'), 0),
    coalesce(sum(qty) filter (where item_type = 'cup_sm'), 0),
    coalesce(sum(qty) filter (where item_type = 'cup_lg'), 0),
    coalesce(sum(qty) filter (where item_type = 'water'),  0),
    coalesce(sum(qty) filter (where item_type = 'ticket'), 0)
  into v_subtotal, v_pcl, v_acg, v_wpm, v_cup_sm, v_cup_lg, v_water, v_tickets
  from public.pos_transaction_items
  where transaction_id = p_txn_id;

  select discount into v_discount from public.pos_transactions where id = p_txn_id;
  v_total := v_subtotal - coalesce(v_discount, 0);
  if v_total < 0 then v_total := 0; end if;

  update public.pos_transactions
    set subtotal   = v_subtotal,
        total      = v_total,
        pcl_qty    = v_pcl,
        acg_qty    = v_acg,
        wpm_qty    = v_wpm,
        cup_sm_qty = v_cup_sm,
        cup_lg_qty = v_cup_lg,
        water_qty  = v_water,
        ticket_qty = v_tickets
    where id = p_txn_id;
end;
$$;

create or replace function public.pos_items_after_change()
returns trigger
language plpgsql
as $$
declare v_txn_id uuid;
begin
  v_txn_id := coalesce((new).transaction_id, (old).transaction_id);
  perform public.recompute_pos_totals(v_txn_id);
  return null;
end;
$$;

drop trigger if exists pos_items_recompute on public.pos_transaction_items;
create trigger pos_items_recompute
  after insert or update or delete on public.pos_transaction_items
  for each row execute function public.pos_items_after_change();

create or replace function public.pos_recompute_on_discount_change()
returns trigger
language plpgsql
as $$
begin
  if old.discount is distinct from new.discount then
    perform public.recompute_pos_totals(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists pos_recompute_on_discount_change on public.pos_transactions;
create trigger pos_recompute_on_discount_change
  after update on public.pos_transactions
  for each row execute function public.pos_recompute_on_discount_change();

-- ── account resolution helper ───────────────────────────────
-- Maps payment_method → account_code with sensible defaults. Frontend can
-- override account_code explicitly when needed.
create or replace function public.account_for_payment_method(p_method public.pos_payment_method)
returns text
language sql
immutable
as $$
  select case p_method
    when 'Cash'          then 'Cash'
    when 'GCash'         then 'GCash General'
    when 'Bank Transfer' then 'Origin Account'
    when 'Xendit'        then 'Xendit'
    else                      'Cash'
  end
$$;

-- ── create_pos_transaction() RPC ────────────────────────────
-- Atomic POS write with idempotency. Frontend calls:
--   const { data: txnId } = await supabase.rpc('create_pos_transaction', {
--     p_idempotency_key: crypto.randomUUID(),
--     p_shift_id: '...',
--     p_payment_method: 'Cash',
--     p_account_code: null,           // null → resolved from payment_method
--     p_discount: 0,
--     p_items: [
--       { item_type: 'juice',  sku_code: 'PCL', qty: 2, unit_price: 195, batch_id: '...' },
--       { item_type: 'cup_lg',                  qty: 1, unit_price: 80, label: 'Large Cup' },
--       { item_type: 'water',                   qty: 1, unit_price: 30, label: 'Water' }
--     ]
--   });
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn_id        uuid;
  v_existing_id   uuid;
  v_method_enum   public.pos_payment_method;
  v_account       text;
  v_event         text;
  v_item          jsonb;
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

  -- Default event_name from shift if not given
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

  return v_txn_id;
end;
$$;

comment on function public.create_pos_transaction is
  'Atomic POS sale write. Returns existing txn_id if idempotency_key already used. Items: jsonb array of {item_type, sku_code?, ticket_type_code?, label?, qty, unit_price, batch_id?}.';

revoke all on function public.create_pos_transaction(text, text, uuid, text, text, timestamptz, numeric, text, text, jsonb) from public;
grant  execute on function public.create_pos_transaction(text, text, uuid, text, text, timestamptz, numeric, text, text, jsonb) to authenticated;

-- ============================================================
-- End of migration 6
-- ============================================================
