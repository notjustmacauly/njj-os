-- Personal daily checklist (each user's own to-do list). one-off / daily /
-- weekly items; "done" for recurring items is per-day. Applied to prod
-- 2026-09-03 via MCP.
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  cadence text not null default 'daily' check (cadence in ('once','daily','weekly')),
  weekday int check (weekday between 0 and 6),
  position int not null default 0,
  completed_at timestamptz,
  last_done_on date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists checklist_user_idx on public.checklist_items (user_id) where deleted_at is null;
alter table public.checklist_items enable row level security;
drop policy if exists checklist_select on public.checklist_items;
create policy checklist_select on public.checklist_items for select to authenticated using (user_id = auth.uid());
grant select on public.checklist_items to authenticated;

create or replace function public.add_checklist_item(p_title text, p_cadence text default 'daily', p_weekday int default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if public.current_user_role() not in ('owner','partner','manager','staff','marketing') then
    raise exception 'not allowed' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title))=0 then raise exception 'title is required' using errcode='22023'; end if;
  if p_cadence not in ('once','daily','weekly') then raise exception 'invalid cadence' using errcode='22023'; end if;
  insert into public.checklist_items(user_id, title, cadence, weekday)
  values (auth.uid(), trim(p_title), p_cadence, case when p_cadence='weekly' then p_weekday else null end)
  returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.toggle_checklist_item(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v record; v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into v from public.checklist_items where id=p_id and user_id=auth.uid() and deleted_at is null;
  if not found then raise exception 'not found' using errcode='23503'; end if;
  if v.cadence='once' then
    update public.checklist_items set completed_at = case when completed_at is null then now() else null end where id=p_id;
  else
    update public.checklist_items set last_done_on = case when last_done_on = v_today then null else v_today end where id=p_id;
  end if;
end; $function$;

create or replace function public.delete_checklist_item(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  update public.checklist_items set deleted_at=now() where id=p_id and user_id=auth.uid();
end; $function$;

revoke all on function public.add_checklist_item(text,text,int) from public, anon;
grant execute on function public.add_checklist_item(text,text,int) to authenticated, service_role;
revoke all on function public.toggle_checklist_item(uuid) from public, anon;
grant execute on function public.toggle_checklist_item(uuid) to authenticated, service_role;
revoke all on function public.delete_checklist_item(uuid) from public, anon;
grant execute on function public.delete_checklist_item(uuid) to authenticated, service_role;
