-- Billing dashboard summary: outstanding / billed / unbilled / overdue, all
-- from unpaid receivables. Overdue uses the bill's due date once billed, else
-- the receivable's own due date. Gated owner/partner/manager (Chrissia).
create or replace function public.billing_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v jsonb; v_today date;
begin
  if current_user_role() not in ('owner','partner','manager') then
    raise exception 'insufficient privileges' using errcode = '42501';
  end if;
  v_today := (now() at time zone 'Asia/Manila')::date;
  select jsonb_build_object(
    'outstanding', coalesce(sum(r.amount), 0),
    'billed',      coalesce(sum(r.amount) filter (where r.status = 'billed'), 0),
    'unbilled',    coalesce(sum(r.amount) filter (where r.status = 'pending'), 0),
    'overdue',     coalesce(sum(r.amount) filter (where coalesce(b.due_date, r.due_date) < v_today), 0),
    'count',       count(*),
    'open_bills',  (select count(*) from public.bills bb
                     where bb.status = 'issued' and bb.deleted_at is null
                       and (bb.total - bb.paid_amount) > 0)
  ) into v
  from public.receivables r
  left join public.bills b on b.id = r.bill_id
  where r.deleted_at is null and r.status in ('pending','billed');
  return v;
end; $function$;

grant execute on function public.billing_summary() to authenticated;
