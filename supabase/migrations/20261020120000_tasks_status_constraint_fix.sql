-- Fix: the tasks_status_valid CHECK constraint was never updated when the
-- 'cancelled' (both boards) and 'for_checking' (marketing) statuses were added,
-- so update_task_status allowed them but the table rejected the write. Widen the
-- constraint to match. Existing rows all use the old values, so this validates.
alter table public.tasks drop constraint if exists tasks_status_valid;
alter table public.tasks add constraint tasks_status_valid check (
  (board = 'admin' and status = any (array['pending','in_progress','blocked','done','cancelled']))
  or
  (board = 'marketing' and status = any (array['pending','for_checking','approved','revise','scheduled','posted','cancelled']))
);
