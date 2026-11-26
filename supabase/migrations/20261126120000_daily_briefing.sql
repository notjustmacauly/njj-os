-- Daily briefing: a once-a-day pop-up assembled server-side, scoped by role.
--
-- Two RPCs:
--   get_daily_briefing(p_force)  READ-ONLY. Decides whether to show today and
--                                assembles the content. Never writes, so Next.js
--                                route prefetch can't flip the "seen today" flag.
--   briefing_mark_shown()        Records that the briefing was shown today and
--                                moves the "last visit" anchor forward. Called by
--                                the client only when the modal is actually shown
--                                (auto path, not manual re-open).
--
-- Tiers:
--   management (owner/partner/manager) — full ops briefing. Peso figures are
--     shown only to owner/partner; a manager sees ops/counts without money.
--   personal (everyone else, incl. marketing) — their own tasks + notifications.

create table if not exists public.briefing_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_shown_date date,
  last_visit_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.briefing_state enable row level security;
drop policy if exists "briefing_state read own" on public.briefing_state;
create policy "briefing_state read own" on public.briefing_state
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------

create or replace function public.get_daily_briefing(p_force boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_today date;
  v_month_start date;
  v_yesterday date;
  v_prev_visit timestamptz;
  v_last_shown date;
  v_should boolean;
  v_tier text;
  v_show_money boolean;
  v_anchor timestamptz;
  v_needs jsonb;
  v_pulse jsonb;
  v_data jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('should_show', false);
  end if;

  v_role := current_user_role()::text;
  v_today := (now() at time zone 'Asia/Manila')::date;
  v_month_start := date_trunc('month', (now() at time zone 'Asia/Manila'))::date;
  v_yesterday := v_today - 1;

  select last_shown_date, last_visit_at
    into v_last_shown, v_prev_visit
  from public.briefing_state where user_id = v_uid;

  v_should := p_force or v_last_shown is null or v_last_shown < v_today;
  if not v_should then
    return jsonb_build_object('should_show', false);
  end if;

  v_anchor := coalesce(v_prev_visit, now() - interval '24 hours');

  if v_role in ('owner', 'partner', 'manager') then
    v_tier := 'management';
  else
    v_tier := 'personal';
  end if;
  v_show_money := v_role in ('owner', 'partner');

  if v_tier = 'management' then
    -- Needs you: ops counts for all management; finance queues owner/partner only.
    v_needs := jsonb_build_object(
      'orders_to_deliver', (select count(*) from public.orders
          where deleted_at is null and fulfillment_status = 'Pending'),
      'bills_to_pay', (select count(*) from public.bills where status = 'issued'),
      'tasks_for_checking', (select count(*) from public.tasks
          where deleted_at is null and status = 'for_checking')
    );
    if v_show_money then
      v_needs := v_needs || jsonb_build_object(
        'payments_to_approve', (select count(*) from public.payments where type = 'general' and status = 'pending'),
        'approved_to_pay', (select count(*) from public.payments where type = 'general' and status = 'approved'),
        'reimbursements_pending', (select count(*) from public.payments where type = 'reimbursement' and status = 'pending')
      );
    end if;

    v_pulse := jsonb_build_object(
      'juice_7d', (select coalesce(sum(units_produced), 0) from public.batches
          where deleted_at is null and batch_date >= v_today - 7),
      'show_money', v_show_money
    );
    if v_show_money then
      v_pulse := v_pulse || jsonb_build_object(
        'cash_on_hand', (select coalesce(sum(current_balance), 0) from public.account_balances),
        'markets_mtd', (select coalesce(sum(total), 0) from public.pos_transactions
            where deleted_at is null and (transaction_at at time zone 'Asia/Manila')::date >= v_month_start),
        'markets_yesterday', (select coalesce(sum(total), 0) from public.pos_transactions
            where deleted_at is null and (transaction_at at time zone 'Asia/Manila')::date = v_yesterday)
      );
    end if;

    v_data := jsonb_build_object(
      'your_day', jsonb_build_object(
        'events_today', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'event_type', q.event_type,
            'starts_at', q.starts_at, 'all_day', q.all_day, 'location', q.location)), '[]'::jsonb)
          from (select ce.id, ce.title, ce.event_type, ce.starts_at, ce.all_day, ce.location
                from public.calendar_events ce
                where ce.deleted_at is null
                  and (ce.starts_at at time zone 'Asia/Manila')::date = v_today
                order by ce.starts_at limit 8) q),
        'tasks_due_today', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'board', q.board, 'status', q.status)), '[]'::jsonb)
          from (select t.id, t.title, t.board, t.status
                from public.tasks t
                where t.assigned_to_user_id = v_uid and t.deleted_at is null
                  and t.status not in ('done', 'posted', 'cancelled')
                  and coalesce(t.due_date, t.post_date) = v_today
                order by t.created_at limit 10) q),
        'my_open_tasks', (select count(*) from public.tasks t
            where t.assigned_to_user_id = v_uid and t.deleted_at is null
              and t.status not in ('done', 'posted', 'cancelled'))
      ),
      'needs_you', v_needs,
      'since_last_visit', jsonb_build_object(
        'new_notifications_count', (select count(*) from public.notifications n
            where n.dismissed_at is null and n.occurred_at > v_anchor
              and (n.recipient_user_id = v_uid or n.recipient_role::text = v_role)),
        'new_notifications', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'message', q.message, 'link', q.link, 'occurred_at', q.occurred_at)), '[]'::jsonb)
          from (select n.id, n.title, n.message, n.link, n.occurred_at
                from public.notifications n
                where n.dismissed_at is null and n.occurred_at > v_anchor
                  and (n.recipient_user_id = v_uid or n.recipient_role::text = v_role)
                order by n.occurred_at desc limit 5) q),
        'new_orders', (select count(*) from public.orders
            where deleted_at is null and created_at > v_anchor)
      ),
      'watch_outs', jsonb_build_object(
        'overdue_tasks', (select count(*) from public.tasks t
            where t.deleted_at is null and t.status not in ('done', 'posted', 'cancelled')
              and coalesce(t.due_date, t.post_date) < v_today),
        'overdue_receivables', (select count(*) from public.receivables
            where status in ('pending', 'billed') and due_date < v_today),
        'unpaid_orders', (select count(*) from public.orders
            where deleted_at is null and payment_status = 'Pending'),
        'low_stock', (select coalesce(jsonb_agg(jsonb_build_object(
            'code', q.code, 'name', q.name, 'remaining', q.remaining, 'unit', q.unit)), '[]'::jsonb)
          from (select i.code, i.name, i.unit, sum(l.qty_remaining) as remaining
                from public.ingredient_lots l
                join public.ingredients i on i.code = l.ingredient_code
                where l.deleted_at is null and i.is_active and i.deleted_at is null
                  and i.type in ('water', 'packaging', 'resale')
                group by i.code, i.name, i.unit
                having sum(l.qty_remaining) <= 24
                order by sum(l.qty_remaining) asc limit 6) q)
      ),
      'pulse', v_pulse
    );
  else
    -- personal tier: their own tasks + notifications only, no financials.
    v_data := jsonb_build_object(
      'your_day', jsonb_build_object(
        'tasks_due_today', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'board', q.board, 'status', q.status)), '[]'::jsonb)
          from (select t.id, t.title, t.board, t.status
                from public.tasks t
                where t.assigned_to_user_id = v_uid and t.deleted_at is null
                  and t.status not in ('done', 'posted', 'cancelled')
                  and coalesce(t.due_date, t.post_date) = v_today
                order by t.created_at limit 10) q),
        'events_today', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'event_type', q.event_type,
            'starts_at', q.starts_at, 'all_day', q.all_day, 'location', q.location)), '[]'::jsonb)
          from (select ce.id, ce.title, ce.event_type, ce.starts_at, ce.all_day, ce.location
                from public.calendar_events ce
                join public.calendar_event_attendees a on a.event_id = ce.id
                where a.user_id = v_uid and ce.deleted_at is null
                  and (ce.starts_at at time zone 'Asia/Manila')::date = v_today
                order by ce.starts_at limit 8) q),
        'my_open_tasks', (select count(*) from public.tasks t
            where t.assigned_to_user_id = v_uid and t.deleted_at is null
              and t.status not in ('done', 'posted', 'cancelled'))
      ),
      'needs_you', jsonb_build_object(
        'for_checking', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'board', q.board, 'status', q.status)), '[]'::jsonb)
          from (select t.id, t.title, t.board, t.status
                from public.tasks t
                where t.assigned_to_user_id = v_uid and t.deleted_at is null
                  and t.status in ('for_checking', 'revise')
                order by t.created_at limit 10) q),
        'overdue_tasks', (select count(*) from public.tasks t
            where t.assigned_to_user_id = v_uid and t.deleted_at is null
              and t.status not in ('done', 'posted', 'cancelled')
              and coalesce(t.due_date, t.post_date) < v_today)
      ),
      'since_last_visit', jsonb_build_object(
        'new_notifications_count', (select count(*) from public.notifications n
            where n.dismissed_at is null and n.occurred_at > v_anchor
              and (n.recipient_user_id = v_uid or n.recipient_role::text = v_role)),
        'new_notifications', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'message', q.message, 'link', q.link, 'occurred_at', q.occurred_at)), '[]'::jsonb)
          from (select n.id, n.title, n.message, n.link, n.occurred_at
                from public.notifications n
                where n.dismissed_at is null and n.occurred_at > v_anchor
                  and (n.recipient_user_id = v_uid or n.recipient_role::text = v_role)
                order by n.occurred_at desc limit 5) q)
      )
    );
  end if;

  return jsonb_build_object(
    'should_show', true,
    'is_force', p_force,
    'tier', v_tier,
    'since', v_prev_visit,
    'today', v_today,
    'generated_at', now(),
    'data', v_data
  );
end;
$$;

grant execute on function public.get_daily_briefing(boolean) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.briefing_mark_shown()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if v_uid is null then
    return;
  end if;
  insert into public.briefing_state (user_id, last_shown_date, last_visit_at, updated_at)
  values (v_uid, v_today, now(), now())
  on conflict (user_id) do update
    set last_shown_date = v_today,
        last_visit_at = now(),
        updated_at = now();
end;
$$;

grant execute on function public.briefing_mark_shown() to authenticated;
