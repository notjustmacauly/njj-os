-- Restricted office role for marketing hires (Alex). Only granted access to
-- the task trackers, their dashboard, and their own profile/settings — NOT
-- finance/operations (see src/lib/roles.ts: not in ALL_ROLES).
alter type public.app_role add value if not exists 'marketing';
