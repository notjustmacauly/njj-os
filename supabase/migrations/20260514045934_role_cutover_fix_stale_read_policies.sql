-- Cleanup pass: the 4 read policies that the big cutover migration missed.

-- user_roles: own row OR owner sees all
drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or current_user_role() = 'owner');

-- partners read: all roles (staff view-only per matrix)
drop policy if exists "ops+ read partners" on public.partners;
create policy "all read partners" on public.partners for select to authenticated
  using (current_user_role() is not null and deleted_at is null);

-- orders read: all roles
drop policy if exists "ops+ read orders" on public.orders;
create policy "all read orders" on public.orders for select to authenticated
  using (current_user_role() is not null and deleted_at is null);

-- order_items read: all roles
drop policy if exists "ops+ read order_items" on public.order_items;
create policy "all read order_items" on public.order_items for select to authenticated
  using (current_user_role() is not null);
