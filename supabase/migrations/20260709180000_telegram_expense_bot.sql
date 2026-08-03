-- =================================================================
-- Telegram → Expense bot backend.
--
-- A teammate sends a payment screenshot (optional caption) to a Telegram
-- bot. A Supabase Edge Function receives it, has Claude read the amount /
-- date / vendor / reference and suggest a category, stores the screenshot,
-- and replies with Confirm / Change category / Reject buttons. On Confirm,
-- the expense is logged via log_expense_from_telegram().
--
-- Only allow-listed Telegram accounts can use the bot. Big expenses
-- (≥ ₱20,000) are blocked from the bot and must be logged/approved in-app.
-- =================================================================

-- 1) Allow-list of Telegram users permitted to log expenses.
create table if not exists public.telegram_allowed_users (
  id               uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  display_name     text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
alter table public.telegram_allowed_users enable row level security;
drop policy if exists tg_allowed_owner_read on public.telegram_allowed_users;
create policy tg_allowed_owner_read on public.telegram_allowed_users
  for select to authenticated using (current_user_role() in ('owner','partner'));

comment on table public.telegram_allowed_users is
  'Telegram accounts allowed to log expenses via the bot. Seed a teammate here (their numeric Telegram user id) to authorise them.';

-- 2) Pending captures: one row per screenshot awaiting Confirm/Reject.
--    The Telegram inline-button callback references this id.
create table if not exists public.telegram_captures (
  id               uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  chat_id          bigint not null,
  logged_by_name   text,
  receipt_url      text,
  amount           numeric(12,2),
  expense_date     date,
  vendor           text,
  payment_ref      text,
  category         text,
  account_code     text,
  raw_caption      text,
  extracted        jsonb,
  status           text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  expense_id       uuid references public.expenses(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists telegram_captures_status_idx on public.telegram_captures (status, created_at);
alter table public.telegram_captures enable row level security;
drop policy if exists tg_captures_owner_read on public.telegram_captures;
create policy tg_captures_owner_read on public.telegram_captures
  for select to authenticated using (current_user_role() in ('owner','partner'));

-- 3) Private storage bucket for the uploaded screenshots.
insert into storage.buckets (id, name, public)
select 'telegram-receipts', 'telegram-receipts', false
where not exists (select 1 from storage.buckets where id = 'telegram-receipts');

-- 4) Log an expense from the bot. Gated by the Telegram allow-list rather
--    than a JWT role (the Edge Function calls this with the service key, so
--    there is no signed-in user). Mirrors create_expense: insert + ledger out.
create or replace function public.log_expense_from_telegram(
  p_telegram_user_id bigint,
  p_amount           numeric,
  p_category         text,
  p_description      text,
  p_account_code     text,
  p_expense_date     date default current_date,
  p_vendor           text default null,
  p_payment_ref      text default null,
  p_receipt_url      text default null,
  p_logged_by_name   text default null,
  p_idempotency_key  text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_expense_id uuid; v_existing_id uuid; v_ledger_id uuid; v_external_id text;
begin
  if not exists (
    select 1 from public.telegram_allowed_users
     where telegram_user_id = p_telegram_user_id and is_active = true
  ) then
    raise exception 'telegram user % is not authorised', p_telegram_user_id using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if p_amount >= 20000 then
    raise exception 'expenses ≥ ₱20,000 must be logged in the app (approval flow), not via the bot' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where code = p_account_code) then
    raise exception 'unknown account_code: %', p_account_code using errcode = '23503';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_id from public.expenses where idempotency_key = p_idempotency_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.expenses (
    idempotency_key, amount, category, description, account_code,
    expense_date, vendor, payment_ref, receipt_url, notes, logged_by_name
  ) values (
    p_idempotency_key, p_amount, p_category, p_description, p_account_code,
    p_expense_date, p_vendor, p_payment_ref, p_receipt_url,
    'Logged via Telegram bot', p_logged_by_name
  ) returning id, external_id into v_expense_id, v_external_id;

  v_ledger_id := public.ledger_apply(
    p_account_code := p_account_code, p_direction := 'out', p_amount := p_amount,
    p_ref_type := 'expense', p_ref_id := v_expense_id, p_ref_external_id := v_external_id,
    p_description := p_description,
    p_idempotency_key := 'expense-' || v_expense_id::text,
    p_occurred_at := p_expense_date::timestamptz
  );
  update public.expenses set ledger_entry_id = v_ledger_id where id = v_expense_id;
  return v_expense_id;
end; $function$;

revoke all on function public.log_expense_from_telegram(bigint, numeric, text, text, text, date, text, text, text, text, text) from public;
-- Executed only by the Edge Function via the service role; no authenticated grant.
grant execute on function public.log_expense_from_telegram(bigint, numeric, text, text, text, date, text, text, text, text, text) to service_role;
