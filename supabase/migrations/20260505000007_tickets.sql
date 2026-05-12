-- ============================================================
-- NJJ OS v2 — Migration 7: Tickets
-- ============================================================
--   tickets — one row per ticket, regardless of source (Wix / POS / manual)
--   check_in_ticket() RPC — idempotent check-in with metadata
--   Trigger: when a pos_transaction_items row of type 'ticket' is inserted,
--   automatically expand into N ticket rows (one per ticket purchased).
--
-- Design choices:
-- - "1 ticket = 1 row, always" — Mac's locked decision. Eager expansion at
--   POS sale time so booth staff can hand the buyer their tickets immediately
--   and check each one in independently.
-- - `source` enum disambiguates Wix vs POS vs manual.
-- - external_id is the QR-scannable / human-typeable identifier:
--     wix    → Wix's own ticket number (e.g. WIXTKT-303F-2XC0-P421P)
--     pos    → '{pos_txn.external_id}-T{n}' (e.g. POS-260505-001-T1)
--     manual → 'MTKT-yymmdd-NNN'
-- - Soft-delete via deleted_at.
-- ============================================================

-- ── enums ───────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ticket_source') then
    create type public.ticket_source as enum ('wix','pos','manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_payment_status') then
    create type public.ticket_payment_status as enum ('Paid','Pending','Refunded');
  end if;
end$$;

-- ── tickets ─────────────────────────────────────────────────
create sequence if not exists public.tickets_manual_external_id_seq start 1;

create table if not exists public.tickets (
  id                       uuid primary key default gen_random_uuid(),
  external_id              text not null unique,
  source                   public.ticket_source not null,
  -- POS linkage
  pos_transaction_id       uuid references public.pos_transactions(id) on delete set null,
  pos_item_id              uuid references public.pos_transaction_items(id) on delete set null,
  -- Wix linkage
  wix_order_id             text,
  wix_event_id             text,
  wix_ticket_number        text,                                                 -- Wix's "ticketNumber" field
  -- Ticket details
  ticket_type_code         text references public.ticket_types(code),
  ticket_type_name         text not null,                                        -- display, fallback if no code
  event_name               text not null,
  event_date               date not null,
  order_date               date not null default current_date,
  buyer_name               text,
  buyer_email              text,
  unit_price               numeric(12,2) not null default 0 check (unit_price >= 0),
  payment_status           public.ticket_payment_status not null default 'Pending',
  -- Check-in
  checked_in_at            timestamptz,
  checked_in_by_user_id    uuid references auth.users(id) on delete set null,
  checked_in_by_name       text,
  -- Misc
  staff_name               text,                                                  -- who issued (POS) or "Wix" / "Manual"
  notes                    text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Source-specific guarantees
  constraint tickets_pos_has_txn   check (source <> 'pos' or pos_transaction_id is not null),
  constraint tickets_wix_has_event check (source <> 'wix' or wix_event_id is not null)
);

comment on table public.tickets is
  'One row per ticket — regardless of whether it came from Wix, POS, or manual entry. external_id is the QR-scannable ID; ticket_type_code references the catalog when known.';

create index if not exists idx_tickets_event_date     on public.tickets (event_date) where deleted_at is null;
create index if not exists idx_tickets_event_name     on public.tickets (event_name, event_date) where deleted_at is null;
create index if not exists idx_tickets_buyer_email    on public.tickets (lower(buyer_email)) where buyer_email is not null and deleted_at is null;
create index if not exists idx_tickets_checked_in     on public.tickets (event_date, checked_in_at) where deleted_at is null;
create index if not exists idx_tickets_source         on public.tickets (source, event_date desc);
create index if not exists idx_tickets_pos_txn        on public.tickets (pos_transaction_id) where pos_transaction_id is not null;
create index if not exists idx_tickets_wix_order      on public.tickets (wix_order_id) where wix_order_id is not null;

drop trigger if exists tickets_set_updated_at on public.tickets;
create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

drop trigger if exists tickets_audit on public.tickets;
create trigger tickets_audit
  after insert or update or delete on public.tickets
  for each row execute function public.audit_trigger();

alter table public.tickets enable row level security;

drop policy if exists "all read tickets" on public.tickets;
create policy "all read tickets"
  on public.tickets for select
  to authenticated
  using (current_user_role() is not null and deleted_at is null);

drop policy if exists "ops+ manage tickets" on public.tickets;
create policy "ops+ manage tickets"
  on public.tickets for all
  to authenticated
  using (current_user_role() in ('admin','manager','ops','staff'))
  with check (current_user_role() in ('admin','manager','ops','staff'));

-- ── auto-expand POS ticket items into ticket rows ───────────
-- When a pos_transaction_items row of type 'ticket' is inserted, fan out to
-- N tickets rows. Eager expansion: each ticket has its own external_id and
-- can be checked in independently.
create or replace function public.expand_pos_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn          record;
  v_type         record;
  v_existing_n   integer;
  v_event_date   date;
  v_buyer_name   text;
  v_i            integer;
  v_external_id  text;
begin
  if new.item_type <> 'ticket' or new.ticket_type_code is null then
    return new;
  end if;

  -- Parent context
  select t.*, s.shift_date
    into v_txn
    from public.pos_transactions t
    left join public.pos_shifts s on s.id = t.shift_id
    where t.id = new.transaction_id;

  select * into v_type from public.ticket_types where code = new.ticket_type_code;

  -- Number new tickets sequentially within this transaction
  select coalesce(count(*), 0) into v_existing_n
    from public.tickets
    where pos_transaction_id = new.transaction_id;

  v_event_date := coalesce(v_txn.shift_date, v_txn.transaction_at::date);
  v_buyer_name := 'Walk-in';

  for v_i in 1..new.qty loop
    v_external_id := v_txn.external_id || '-T' || (v_existing_n + v_i)::text;

    insert into public.tickets (
      external_id, source,
      pos_transaction_id, pos_item_id,
      ticket_type_code, ticket_type_name,
      event_name, event_date, order_date,
      buyer_name, unit_price, payment_status, staff_name
    ) values (
      v_external_id, 'pos',
      new.transaction_id, new.id,
      new.ticket_type_code, coalesce(v_type.name, new.ticket_type_code),
      coalesce(v_txn.event_name, v_type.event_category, 'Event'),
      v_event_date,
      v_txn.transaction_at::date,
      v_buyer_name, new.unit_price, 'Paid',
      v_txn.staff_name
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists pos_items_expand_tickets on public.pos_transaction_items;
create trigger pos_items_expand_tickets
  after insert on public.pos_transaction_items
  for each row execute function public.expand_pos_tickets();

-- ── manual_ticket external_id helper ────────────────────────
-- Auto-assigns an MTKT-yymmdd-NNN id when a manual ticket is inserted without one.
create or replace function public.assign_manual_ticket_external_id()
returns trigger
language plpgsql
as $$
declare v_date_part text;
begin
  if new.source = 'manual' and (new.external_id is null or new.external_id = '') then
    v_date_part := to_char(coalesce(new.order_date, current_date), 'YYMMDD');
    new.external_id := 'MTKT-' || v_date_part || '-' ||
      lpad(nextval('public.tickets_manual_external_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_assign_manual_external_id on public.tickets;
create trigger tickets_assign_manual_external_id
  before insert on public.tickets
  for each row execute function public.assign_manual_ticket_external_id();

-- ── check_in_ticket() RPC ───────────────────────────────────
-- Idempotent check-in. Returns jsonb with status info so the scanner UI can
-- show "✓ checked in just now" or "⚠ already checked in by X at Y".
create or replace function public.check_in_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket           record;
  v_email            text;
begin
  if current_user_role() not in ('admin','manager','ops','staff') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ticket_not_found');
  end if;

  if v_ticket.checked_in_at is not null then
    return jsonb_build_object(
      'ok',                  true,
      'already_checked_in',  true,
      'checked_in_at',       v_ticket.checked_in_at,
      'checked_in_by_name',  v_ticket.checked_in_by_name,
      'ticket_id',           v_ticket.id
    );
  end if;

  select email into v_email from auth.users where id = auth.uid();

  update public.tickets
    set checked_in_at         = now(),
        checked_in_by_user_id = auth.uid(),
        checked_in_by_name    = coalesce(v_email, 'Staff')
    where id = p_ticket_id;

  return jsonb_build_object(
    'ok',                 true,
    'already_checked_in', false,
    'ticket_id',          p_ticket_id,
    'event_name',         v_ticket.event_name,
    'event_date',         v_ticket.event_date,
    'buyer_name',         v_ticket.buyer_name,
    'ticket_type',        v_ticket.ticket_type_name
  );
end;
$$;

comment on function public.check_in_ticket is
  'Idempotent ticket check-in. Returns status jsonb with already_checked_in flag and the checker''s name + time when applicable.';

revoke all on function public.check_in_ticket(uuid) from public;
grant  execute on function public.check_in_ticket(uuid) to authenticated;

-- ============================================================
-- End of migration 7
-- ============================================================
