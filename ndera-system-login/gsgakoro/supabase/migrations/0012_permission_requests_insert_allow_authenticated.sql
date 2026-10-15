-- ============================================================
-- SDMS — fix: permission request submission was blocked by RLS
-- whenever the browser still had an active staff session.
--
-- "Anyone can submit a permission request" only granted the
-- `anon` role. Both submission pages (the walk-in login-page form
-- and the parent-portal contact form) are meant to work whether or
-- not the browser happens to also be signed in as staff — but if a
-- staff member is still logged in on the same browser/tab, Supabase
-- sends the insert as `authenticated`, which had no INSERT policy
-- at all, so it was rejected outright.
--
-- Widens the same policy to cover both roles, no other change.
-- ============================================================

drop policy if exists "Anyone can submit a permission request" on public.permission_requests;

create policy "Anyone can submit a permission request"
  on public.permission_requests
  for insert
  to anon, authenticated
  with check (true);
