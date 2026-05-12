-- ============================================================
-- NJJ OS v2 — Migration 14: Notifications
-- ============================================================
--   notifications     — in-app notifications, targeted to user OR role
--   notify()      RPC — send a notification (creates the row)
--   mark_read()   RPC — mark one or many as read
--   dismiss()     RPC — soft-dismiss
--
-- Real-time delivery is via Supabase Realtime subscriptions on the
-- notifications table — frontend listens for inserts where recipient
-- matches.
-- ============================================================

-- ── notifications ───────────────────────────────────────────
create table if not exists public.notifications (
  id                   uuid primary key default gen_random_uuid(),
  occurred_at          timestamptz not null default now(),
  -- Recipient: either a specific user OR a role (broadcast). Exactly one.
  recipient_user_id    uuid references auth.users(id) on delete cascade,
  recipient_role       public.app_role,
  type                 text not null,           -- 'order','payment','bill','packed','sync_error','low_stock','custom'
  title                text not null,
  message              text,
  link                 text,                    -- in-app path, e.g. '/orders/abc-123'
  created_by_user_id   uuid references auth.users(id) on delete set null,
  read_at              timestamptz,
  dismissed_at         timestamptz,
  created_at           timestamptz not null default now(),
  -- Exactly one recipient target
  constraint notifications_one_recipient check (
    (recipient_user_id is not null and recipient_role is null) or
    (recipient_user_id is null and recipient_role is not null)
  )
);

comment on table public.notifications is
  'In-app notifications. Recipient is either a specific user OR a role (broadcast). Frontend uses Supabase Realtime to subscribe.';

create index if not exists idx_notifications_user_unread  on public.notifications (recipient_user_id, occurred_at desc) where read_at is null;
create index if not exists idx_notifications_role_unread  on public.notifications (recipient_role, occurred_at desc) where read_at is null;
create index if not exists idx_notifications_user         on public.notifications (recipient_user_id, occurred_at desc);
create index if not exists idx_notifications_role         on public.notifications (recipient_role, occurred_at desc);

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select
  to authenticated
  using (
    recipient_user_id = auth.uid()
    or recipient_role = current_user_role()
  );

drop policy if exists "users mark own notifications read" on public.notifications;
create policy "users mark own notifications read"
  on public.notifications for update
  to authenticated
  using (
    recipient_user_id = auth.uid()
    or recipient_role = current_user_role()
  )
  with check (
    recipient_user_id = auth.uid()
    or recipient_role = current_user_role()
  );

-- ── notify() helper ─────────────────────────────────────────
-- Internal-friendly RPC. Other RPCs call this when they want to fire a notification.
create or replace function public.notify(
  p_type             text,
  p_title            text,
  p_message          text default null,
  p_link             text default null,
  p_recipient_user_id uuid default null,
  p_recipient_role   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_recipient_user_id is null and p_recipient_role is null then
    raise exception 'must specify recipient_user_id or recipient_role' using errcode = '22023';
  end if;

  insert into public.notifications (
    type, title, message, link,
    recipient_user_id, recipient_role,
    created_by_user_id
  ) values (
    p_type, p_title, p_message, p_link,
    p_recipient_user_id,
    case when p_recipient_role is not null then p_recipient_role::public.app_role else null end,
    auth.uid()
  ) returning id into v_id;

  return v_id;
end; $$;

revoke all on function public.notify(text, text, text, text, uuid, text) from public;
grant  execute on function public.notify(text, text, text, text, uuid, text) to authenticated;

-- ── mark_notifications_read() ───────────────────────────────
create or replace function public.mark_notifications_read(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.notifications
    set read_at = now()
    where id = any (p_ids)
      and (recipient_user_id = auth.uid() or recipient_role = current_user_role())
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke all on function public.mark_notifications_read(uuid[]) from public;
grant  execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ── dismiss_notification() ──────────────────────────────────
create or replace function public.dismiss_notification(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications
    set dismissed_at = now(), read_at = coalesce(read_at, now())
    where id = p_id
      and (recipient_user_id = auth.uid() or recipient_role = current_user_role());
end; $$;

revoke all on function public.dismiss_notification(uuid) from public;
grant  execute on function public.dismiss_notification(uuid) to authenticated;

-- ── unread_notification_count VIEW ──────────────────────────
-- Bell-icon counter source. Frontend reads this for the current session.
create or replace view public.unread_notification_count as
select
  count(*) filter (where dismissed_at is null) as unread_count
from public.notifications
where read_at is null
  and (recipient_user_id = auth.uid() or recipient_role = current_user_role());

comment on view public.unread_notification_count is
  'Single-row view returning the current user''s unread notification count.';

-- ============================================================
-- End of migration 14 — Phase 1 schema complete
-- ============================================================
