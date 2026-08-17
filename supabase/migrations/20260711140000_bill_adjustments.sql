-- Bill adjustments: itemized credits/surcharges added to a bill AFTER the
-- receivables are attached — e.g. crediting disposed/expired cans. Each line
-- has a reason and a signed amount (negative = credit/reduces, positive =
-- surcharge/adds). Allowed while the bill is draft or issued (not once paid).
create table if not exists public.bill_adjustments (
  id                 uuid primary key default gen_random_uuid(),
  bill_id            uuid not null references public.bills(id) on delete cascade,
  description        text not null,
  amount             numeric(12,2) not null,   -- negative = credit, positive = surcharge
  created_by_user_id uuid,
  created_at         timestamptz not null default now()
);
create index if not exists bill_adjustments_bill_idx on public.bill_adjustments (bill_id);

alter table public.bill_adjustments enable row level security;
drop policy if exists bill_adjustments_read on public.bill_adjustments;
create policy bill_adjustments_read on public.bill_adjustments
  for select to authenticated
  using (current_user_role() in ('owner','partner','manager'));

-- Fold adjustments into the bill total.
create or replace function public.recompute_bill_totals(p_bill_id uuid)
returns void
language plpgsql
as $function$
declare
  v_subtotal numeric(12,2); v_total numeric(12,2);
  v_delivery numeric(12,2); v_discount numeric(12,2); v_adj numeric(12,2);
begin
  select coalesce(sum(r.amount), 0) into v_subtotal
  from public.bill_receivables br
  join public.receivables r on r.id = br.receivable_id
  where br.bill_id = p_bill_id;

  select delivery_fees, discount into v_delivery, v_discount
  from public.bills where id = p_bill_id;

  select coalesce(sum(amount), 0) into v_adj
  from public.bill_adjustments where bill_id = p_bill_id;

  v_total := v_subtotal + coalesce(v_delivery, 0) - coalesce(v_discount, 0) + v_adj;
  if v_total < 0 then v_total := 0; end if;

  update public.bills set subtotal = v_subtotal, total = v_total where id = p_bill_id;
end; $function$;

-- Recompute whenever adjustments change.
create or replace function public.bill_adjustments_after_change()
returns trigger
language plpgsql
as $function$
begin
  perform public.recompute_bill_totals(coalesce((new).bill_id, (old).bill_id));
  return null;
end; $function$;

drop trigger if exists bill_adjustments_recompute on public.bill_adjustments;
create trigger bill_adjustments_recompute
  after insert or update or delete on public.bill_adjustments
  for each row execute function public.bill_adjustments_after_change();

-- Add an adjustment (owner/partner/manager) to a draft or issued bill.
create or replace function public.add_bill_adjustment(
  p_bill_id     uuid,
  p_description text,
  p_amount      numeric
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_status text; v_id uuid;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to adjust bills' using errcode = '42501';
  end if;
  select status into v_status from public.bills where id = p_bill_id and deleted_at is null;
  if v_status is null then
    raise exception 'bill not found' using errcode = '23503';
  end if;
  if v_status not in ('draft','issued') then
    raise exception 'can only adjust a draft or issued (unpaid) bill, not a % one', v_status using errcode = '22023';
  end if;
  if p_description is null or btrim(p_description) = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'amount must be non-zero' using errcode = '22023';
  end if;

  insert into public.bill_adjustments (bill_id, description, amount, created_by_user_id)
    values (p_bill_id, btrim(p_description), p_amount, auth.uid())
    returning id into v_id;
  return v_id;
end; $function$;

-- Remove an adjustment (owner/partner/manager), only while the bill is unpaid.
create or replace function public.remove_bill_adjustment(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_status text;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges to adjust bills' using errcode = '42501';
  end if;
  select b.status into v_status
  from public.bill_adjustments a join public.bills b on b.id = a.bill_id
  where a.id = p_id;
  if v_status is null then return; end if;
  if v_status not in ('draft','issued') then
    raise exception 'cannot change adjustments on a % bill', v_status using errcode = '22023';
  end if;
  delete from public.bill_adjustments where id = p_id;
end; $function$;

revoke all on function public.add_bill_adjustment(uuid, text, numeric) from public;
revoke all on function public.remove_bill_adjustment(uuid) from public;
grant execute on function public.add_bill_adjustment(uuid, text, numeric) to authenticated;
grant execute on function public.remove_bill_adjustment(uuid) to authenticated;
