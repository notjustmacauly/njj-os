-- =================================================================
-- Website (Wix replacement) — Phase A foundations.
-- Pure schema bedrock for the public storefront + events. No UI, no
-- effect on the existing staff app. Additive & default-safe.
--
-- Decisions in effect: delivery-only fulfilment, optional customer
-- accounts (guest checkout), Gmail for confirmation emails.
-- See docs/specs/WEBSITE_MODULE.md.
-- =================================================================

-- 1) Holding account for screenshot-confirmed (bank-QR) online payments.
--    Soft-confirmed cash sits here until reconciled against the bank.
insert into public.accounts (code, name, opening_balance, currency, is_active, notes)
select 'Unverified Receipts',
       'Unverified QR/e-wallet receipts (holding)',
       0,
       coalesce((select currency from public.accounts where currency is not null limit 1), 'PHP'),
       true,
       'Holding bucket for online bank-QR payments confirmed by screenshot. Moved to the real account on verification; reversed on reject.'
where not exists (select 1 from public.accounts where code = 'Unverified Receipts');

-- 2) Online-order fields on `orders` (channel 'Online' already exists).
alter table public.orders
  add column if not exists customer_email        text,
  add column if not exists customer_phone        text,
  add column if not exists delivery_address      text,
  add column if not exists payment_method        text,
  add column if not exists payment_verification  text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_method_check') then
    alter table public.orders add constraint orders_payment_method_check
      check (payment_method is null or payment_method in ('bank_qr','xendit_card','xendit_ewallet'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_verification_check') then
    alter table public.orders add constraint orders_payment_verification_check
      check (payment_verification is null or payment_verification in ('auto','unverified','verified','rejected'));
  end if;
end $$;

-- 3) Events — our own event management (replaces Wix Events). Schema only.
create table if not exists public.events (
  id                 uuid primary key default gen_random_uuid(),
  external_id        text unique,
  name               text not null,
  slug               text unique,
  venue              text,
  event_date         date not null,
  start_time         time,
  end_time           time,
  capacity           integer check (capacity is null or capacity >= 0),
  status             text not null default 'draft' check (status in ('draft','published','closed')),
  cover_image_url    text,
  description        text,
  published_at       timestamptz,
  created_by_user_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists events_status_date_idx on public.events (status, event_date) where deleted_at is null;

comment on table public.events is
  'Own event records for the website (replaces Wix Events). Tickets sold link here via tickets.event_id (added in Phase C).';

alter table public.events enable row level security;
drop policy if exists events_select_auth on public.events;
create policy events_select_auth on public.events for select to authenticated using (true);

-- 4) payment_proofs — screenshot uploads + fraud signals for bank-QR pay.
create table if not exists public.payment_proofs (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders(id),
  ticket_id           uuid references public.tickets(id),
  image_url           text not null,
  image_sha256        text,
  declared_amount     numeric(12,2),
  decision            text not null default 'pending' check (decision in ('pending','verified','rejected')),
  flags               jsonb not null default '[]'::jsonb,
  uploaded_at         timestamptz not null default now(),
  reviewed_at         timestamptz,
  reviewed_by_user_id uuid,
  created_at          timestamptz not null default now(),
  constraint payment_proofs_one_ref check (num_nonnulls(order_id, ticket_id) = 1)
);
create index if not exists payment_proofs_sha_idx     on public.payment_proofs (image_sha256);
create index if not exists payment_proofs_pending_idx on public.payment_proofs (decision) where decision = 'pending';

comment on table public.payment_proofs is
  'Uploaded payment screenshots for online bank-QR orders/tickets. image_sha256 powers duplicate detection; decision drives the review queue.';

alter table public.payment_proofs enable row level security;
drop policy if exists payment_proofs_select_auth on public.payment_proofs;
create policy payment_proofs_select_auth on public.payment_proofs for select to authenticated using (true);
