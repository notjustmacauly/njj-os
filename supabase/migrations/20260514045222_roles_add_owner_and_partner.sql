-- Step 1 of the role restructure. Adds 'owner' and 'partner' to the
-- app_role enum so they can be used in subsequent migrations. The retired
-- values ('admin','ops') remain in the enum as orphans; cleanup is a
-- separate future migration once we're sure nothing in user data or
-- audit_log references them.

alter type public.app_role add value if not exists 'owner';
alter type public.app_role add value if not exists 'partner';
