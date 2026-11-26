-- Daily briefing v2 — reshape per Mac's notes:
--  * Owner (Mac): finance queue (approve / pay out / reimbursements / bills) +
--    tasks for checking. Pulse.
--  * Partner (Hanneh): ops — orders + production + her own outstanding requests.
--    No finance in "needs you". Pulse.
--  * Manager (future seat): like partner, no pulse.
--  * Everyone: tasks given to them AND tasks they gave others; events today OR
--    the next upcoming one; their outstanding requests; their notifications.
--  * Pulse (owner + partner only): money received, money spent, juice produced,
--    juice sold — all month-to-date.
--
-- Role logic lives here: needs_you / watch_outs / pulse are emitted as ready
-- arrays so the client just renders them.

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
  v_prev_visit timestamptz;
  v_last_shown date;
  v_should boolean;
  v_scope_company boolean;
  v_has_pulse boolean;
  v_anchor timestamptz;
  v_events_today jsonb;
  v_next_event jsonb;
  v_my_requests jsonb;
  v_needs jsonb;
  v_watch jsonb;
  v_pulse jsonb;
  v_data jsonb;
  v_req_count int;
begin
  if v_uid is null then
    return jsonb_build_object('should_show', false);
  end if;

  v_role := current_user_role()::text;
  v_today := (now() at time zone 'Asia/Manila')::date;
  v_month_start := date_trunc('month', (now() at time zone 'Asia/Manila'))::date;

  select last_shown_date, last_visit_at
    into v_last_shown, v_prev_visit
  from public.briefing_state where user_id = v_uid;

  v_should := p_force or v_last_shown is null or v_last_shown < v_today;
  if not v_should then
    return jsonb_build_object('should_show', false);
  end if;

  v_anchor := coalesce(v_prev_visit, now() - interval '24 hours');
  v_scope_company := v_role in ('owner', 'partner', 'manager');
  v_has_pulse := v_role in ('owner', 'partner');

  -- Events today + next upcoming — company-wide for management, personal
  -- (attendee) for everyone else.
  if v_scope_company then
    v_events_today := (select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'title', q.title, 'event_type', q.event_type,
        'starts_at', q.starts_at, 'all_day', q.all_day, 'location', q.location)), '[]'::jsonb)
      from (select ce.id, ce.title, ce.event_type, ce.starts_at, ce.all_day, ce.location
            from public.calendar_events ce
            where ce.deleted_at is null
              and (ce.starts_at at time zone 'Asia/Manila')::date = v_today
            order by ce.starts_at limit 8) q);
    v_next_event := (select to_jsonb(q) from (
        select ce.id, ce.title, ce.event_type, ce.starts_at, ce.all_day, ce.location
        from public.calendar_events ce
        where ce.deleted_at is null and ce.starts_at > now()
          and (ce.starts_at at time zone 'Asia/Manila')::date > v_today
        order by ce.starts_at limit 1) q);
  else
    v_events_today := (select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id, 'title', q.title, 'event_type', q.event_type,
        'starts_at', q.starts_at, 'all_day', q.all_day, 'location', q.location)), '[]'::jsonb)
      from (select ce.id, ce.title, ce.event_type, ce.starts_at, ce.all_day, ce.location
            from public.calendar_events ce
            join public.calendar_event_attendees a on a.event_id = ce.id
            where a.user_id = v_uid and ce.deleted_at is null
              and (ce.starts_at at time zone 'Asia/Manila')::date = v_today
            order by ce.starts_at limit 8) q);
    v_next_event := (select to_jsonb(q) from (
        select ce.id, ce.title, ce.event_type, ce.starts_at, ce.all_day, ce.location
        from public.calendar_events ce
        join public.calendar_event_attendees a on a.event_id = ce.id
        where a.user_id = v_uid and ce.deleted_at is null and ce.starts_at > now()
          and (ce.starts_at at time zone 'Asia/Manila')::date > v_today
        order by ce.starts_at limit 1) q);
  end if;

  -- My outstanding requests (things I submitted that aren't paid yet).
  select count(*) into v_req_count
  from public.payments
  where requested_by_user_id = v_uid and deleted_at is null
    and status in ('pending', 'approved');
  if v_req_count > 0 then
    v_my_requests := (select jsonb_build_object(
        'count', count(*),
        'amount', coalesce(sum(amount), 0),
        'reimb', count(*) filter (where type = 'reimbursement'))
      from public.payments
      where requested_by_user_id = v_uid and deleted_at is null
        and status in ('pending', 'approved'));
  else
    v_my_requests := null;
  end if;

  -- needs_you — role-specific chip array.
  if v_role = 'owner' then
    v_needs := jsonb_build_array(
      jsonb_build_object('label','Payments to approve','href','/dashboard/finance/payments','accent','coral','hint','Awaiting your approval',
        'count',(select count(*) from public.payments where type='general' and status='pending')),
      jsonb_build_object('label','Approved · to pay out','href','/dashboard/finance/payments','accent','berry','hint','Approved, not yet paid',
        'count',(select count(*) from public.payments where type='general' and status='approved')),
      jsonb_build_object('label','Reimbursements to pay','href','/dashboard/finance/reimbursements','accent','peri','hint',null,
        'count',(select count(*) from public.payments where type='reimbursement' and status='pending')),
      jsonb_build_object('label','Bills to pay','href','/dashboard/finance/bills','accent','coral','hint',null,
        'count',(select count(*) from public.bills where status='issued')),
      jsonb_build_object('label','Tasks for checking','href','/dashboard/tasks','accent','berry','hint',null,
        'count',(select count(*) from public.tasks where deleted_at is null and status='for_checking'))
    );
  elsif v_role in ('partner', 'manager') then
    v_needs := jsonb_build_array(
      jsonb_build_object('label','Orders to deliver','href','/dashboard/orders','accent','yellow','hint','Mark delivered when out',
        'count',(select count(*) from public.orders where deleted_at is null and fulfillment_status='Pending')),
      jsonb_build_object('label','Unpaid orders','href','/dashboard/orders','accent','coral','hint','Awaiting payment',
        'count',(select count(*) from public.orders where deleted_at is null and payment_status='Pending')),
      jsonb_build_object('label','Tasks for checking','href','/dashboard/tasks','accent','berry','hint',null,
        'count',(select count(*) from public.tasks where deleted_at is null and status='for_checking'))
    );
  else
    v_needs := jsonb_build_array(
      jsonb_build_object('label','Tasks to check','href','/dashboard/tasks','accent','berry','hint',null,
        'count',(select count(*) from public.tasks where assigned_to_user_id=v_uid and deleted_at is null and status in ('for_checking','revise'))),
      jsonb_build_object('label','Overdue tasks','href','/dashboard/tasks','accent','coral','hint',null,
        'count',(select count(*) from public.tasks where assigned_to_user_id=v_uid and deleted_at is null
                   and status not in ('done','posted','cancelled') and coalesce(due_date,post_date) < v_today))
    );
  end if;

  -- watch_outs — management only.
  if v_role = 'owner' then
    v_watch := jsonb_build_array(
      jsonb_build_object('label','Overdue tasks','href','/dashboard/tasks',
        'count',(select count(*) from public.tasks where deleted_at is null and status not in ('done','posted','cancelled') and coalesce(due_date,post_date) < v_today)),
      jsonb_build_object('label','Overdue receivables','href','/dashboard/finance/receivables',
        'count',(select count(*) from public.receivables where status in ('pending','billed') and due_date < v_today)),
      jsonb_build_object('label','Unpaid orders','href','/dashboard/orders',
        'count',(select count(*) from public.orders where deleted_at is null and payment_status='Pending'))
    );
  elsif v_role in ('partner', 'manager') then
    v_watch := jsonb_build_array(
      jsonb_build_object('label','Overdue tasks','href','/dashboard/tasks',
        'count',(select count(*) from public.tasks where deleted_at is null and status not in ('done','posted','cancelled') and coalesce(due_date,post_date) < v_today))
    );
  else
    v_watch := '[]'::jsonb;
  end if;

  -- pulse — owner + partner only, all month-to-date.
  if v_has_pulse then
    v_pulse := jsonb_build_array(
      jsonb_build_object('label','Money received','sub','this month · all sources','money',true,
        'value',(select coalesce(sum(amount),0) from public.ledger_entries
                 where direction='in' and ref_type <> 'transfer'
                   and (occurred_at at time zone 'Asia/Manila')::date >= v_month_start)),
      jsonb_build_object('label','Money spent','sub','this month · all outflows','money',true,
        'value',(select coalesce(sum(amount),0) from public.ledger_entries
                 where direction='out' and ref_type <> 'transfer'
                   and (occurred_at at time zone 'Asia/Manila')::date >= v_month_start)),
      jsonb_build_object('label','Juice produced','sub','units · this month','money',false,
        'value',(select coalesce(sum(units_produced),0) from public.batches
                 where deleted_at is null and batch_date >= v_month_start)),
      jsonb_build_object('label','Juice sold','sub','cans · this month','money',false,
        'value',(
          (select coalesce(sum(coalesce(pcl_qty,0)+coalesce(acg_qty,0)+coalesce(wpm_qty,0)),0)
             from public.pos_transactions
             where deleted_at is null and (transaction_at at time zone 'Asia/Manila')::date >= v_month_start)
          +
          (select coalesce(sum(coalesce(pcl_qty,0)+coalesce(acg_qty,0)+coalesce(wpm_qty,0)),0)
             from public.orders
             where deleted_at is null and order_date >= v_month_start)
        ))
    );
  else
    v_pulse := null;
  end if;

  v_data := jsonb_build_object(
    'your_day', jsonb_build_object(
      'events_today', v_events_today,
      'next_event', v_next_event,
      'tasks_due_today', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'title', q.title, 'board', q.board, 'status', q.status)), '[]'::jsonb)
        from (select t.id, t.title, t.board, t.status
              from public.tasks t
              where t.assigned_to_user_id = v_uid and t.deleted_at is null
                and t.status not in ('done','posted','cancelled')
                and coalesce(t.due_date, t.post_date) = v_today
              order by t.created_at limit 10) q)
    ),
    'my_tasks', jsonb_build_object(
      'assigned_to_me', (select count(*) from public.tasks t
          where t.assigned_to_user_id = v_uid and t.deleted_at is null
            and t.status not in ('done','posted','cancelled')),
      'assigned_to_me_list', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'title', q.title, 'board', q.board, 'status', q.status, 'due', q.due)), '[]'::jsonb)
        from (select t.id, t.title, t.board, t.status, coalesce(t.due_date, t.post_date) as due
              from public.tasks t
              where t.assigned_to_user_id = v_uid and t.deleted_at is null
                and t.status not in ('done','posted','cancelled')
              order by (coalesce(t.due_date, t.post_date)) asc nulls last limit 6) q),
      'i_assigned', (select count(*) from public.tasks t
          where t.assigned_by_user_id = v_uid and t.assigned_to_user_id is distinct from v_uid
            and t.deleted_at is null and t.status not in ('done','posted','cancelled'))
    ),
    'my_requests', v_my_requests,
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
      'new_orders', case when v_scope_company then
          (select count(*) from public.orders where deleted_at is null and created_at > v_anchor)
        else null end
    ),
    'watch_outs', v_watch,
    'low_stock', case when v_scope_company then (select coalesce(jsonb_agg(jsonb_build_object(
          'code', q.code, 'name', q.name, 'remaining', q.remaining, 'unit', q.unit)), '[]'::jsonb)
        from (select i.code, i.name, i.unit, sum(l.qty_remaining) as remaining
              from public.ingredient_lots l
              join public.ingredients i on i.code = l.ingredient_code
              where l.deleted_at is null and i.is_active and i.deleted_at is null
                and i.type in ('water','packaging','resale')
              group by i.code, i.name, i.unit
              having sum(l.qty_remaining) <= 24
              order by sum(l.qty_remaining) asc limit 6) q)
      else '[]'::jsonb end,
    'pulse', v_pulse
  );

  return jsonb_build_object(
    'should_show', true,
    'is_force', p_force,
    'tier', v_role,
    'since', v_prev_visit,
    'today', v_today,
    'generated_at', now(),
    'data', v_data
  );
end;
$$;

grant execute on function public.get_daily_briefing(boolean) to authenticated;
