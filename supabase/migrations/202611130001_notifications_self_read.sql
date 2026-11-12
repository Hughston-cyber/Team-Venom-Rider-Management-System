-- Allow members to mark only their own in-app notifications as read.
-- Restrict the authenticated role to the two read-state columns.
revoke update on table public.notifications from authenticated;
grant update (read_at, status) on table public.notifications to authenticated;

drop policy if exists notifications_update_own_read on public.notifications;
create policy notifications_update_own_read
on public.notifications
for update
to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()));
