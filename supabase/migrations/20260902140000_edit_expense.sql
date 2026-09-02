-- Owner-only correction of an expense's category / description / vendor / date
-- / notes (fixing a wrong category). Amount + account are NOT editable here —
-- changing those goes through void + re-create so the ledger stays correct.
-- If the date changes, the ledger entry's month is synced too.
-- (Applied to prod 2026-09-02 via MCP; file keeps repo in sync.)
create or replace function public.edit_expense(
  p_expense_id uuid,
  p_category   text,
  p_description text,
  p_vendor     text default null,
  p_expense_date date default null,
  p_notes      text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v record;
begin
  if public.current_user_role() <> 'owner' then
    raise exception 'only the owner can edit expenses' using errcode = '42501';
  end if;

  select * into v from public.expenses where id = p_expense_id and deleted_at is null;
  if not found then
    raise exception 'expense not found' using errcode = '23503';
  end if;
  if v.voided_at is not null then
    raise exception 'cannot edit a voided expense' using errcode = '22023';
  end if;
  if p_category is null or length(trim(p_category)) = 0 then
    raise exception 'category is required' using errcode = '22023';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description is required' using errcode = '22023';
  end if;

  update public.expenses
     set category     = p_category,
         description  = trim(p_description),
         vendor       = nullif(trim(coalesce(p_vendor, '')), ''),
         expense_date = coalesce(p_expense_date, expense_date),
         notes        = nullif(trim(coalesce(p_notes, '')), ''),
         updated_at   = now()
   where id = p_expense_id;

  if p_expense_date is not null and p_expense_date <> v.expense_date then
    update public.ledger_entries
       set occurred_at = p_expense_date::timestamptz
     where ref_type = 'expense' and ref_id = p_expense_id;
  end if;
end; $function$;

revoke all on function public.edit_expense(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.edit_expense(uuid, text, text, text, date, text) to authenticated, service_role;
