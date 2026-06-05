-- Receivables can be marked paid into ANY account (the modal has always had a
-- "Receiving account" picker), e.g. a client paying directly to GCash/RCBC and
-- skipping the bill. The ledger description hard-coded "paid in cash", which is
-- inaccurate for non-cash accounts. Reword to "paid directly". Logic unchanged.

create or replace function public.mark_receivable_paid_cash(
  p_receivable_id uuid,
  p_account_code text,
  p_amount numeric,
  p_paid_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recv      record;
  v_ledger_id uuid;
begin
  if current_user_role() not in ('owner','partner') then
    raise exception 'insufficient privileges to mark receivables paid' using errcode = '42501';
  end if;
  if p_account_code is null or length(trim(p_account_code)) = 0 then
    raise exception 'account_code is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select r.*, o.external_id as order_external_id, o.id as order_id_full
    into v_recv
    from public.receivables r
    join public.orders o on o.id = r.order_id
   where r.id = p_receivable_id and r.deleted_at is null;
  if not found then
    raise exception 'receivable not found' using errcode = '23503';
  end if;
  if v_recv.status <> 'pending' then
    raise exception 'receivable must be pending to mark paid (status = %). Already billed? Pay the bill instead.',
      v_recv.status using errcode = '22023';
  end if;

  v_ledger_id := public.ledger_apply(
    p_account_code     := p_account_code,
    p_direction        := 'in',
    p_amount           := p_amount,
    p_ref_type         := 'receivable',
    p_ref_id           := p_receivable_id,
    p_ref_external_id  := v_recv.external_id,
    p_description      := 'Receivable ' || coalesce(v_recv.external_id, p_receivable_id::text)
                          || ' paid directly (order ' || coalesce(v_recv.order_external_id, '') || ')',
    p_idempotency_key  := 'recv-cash-' || p_receivable_id::text,
    p_occurred_at      := p_paid_date::timestamptz
  );

  update public.receivables
     set status            = 'paid',
         paid_amount       = p_amount,
         paid_date         = p_paid_date,
         paid_account_code = p_account_code,
         ledger_entry_id   = v_ledger_id,
         updated_at        = now()
   where id = p_receivable_id;

  update public.orders
     set payment_status = 'Paid',
         updated_at     = now()
   where id = v_recv.order_id;

  return v_ledger_id;
end; $function$;
