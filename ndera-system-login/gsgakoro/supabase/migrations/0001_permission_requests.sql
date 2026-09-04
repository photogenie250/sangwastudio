-- ============================================================
-- SDMS — Student permission requests (public login-page form)
--
-- Anyone on the login page (no account needed) can submit a
-- request. Only signed-in, active staff can read the list back.
-- Nobody can update or delete from the client — that stays an
-- admin/DB-console action.
-- ============================================================

create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  requester_name text not null,
  requester_phone text not null,
  student_name text not null,
  student_class text,
  reason text not null,
  status text not null default 'pending', -- pending | notified | reviewed
  created_at timestamptz not null default now()
);

alter table public.permission_requests enable row level security;

-- Public visitors on the login page can submit a request.
create policy "Anyone can submit a permission request"
  on public.permission_requests
  for insert
  to anon
  with check (true);

-- Only active staff accounts can read submitted requests.
create policy "Active staff can view permission requests"
  on public.permission_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.status = 'active'
    )
  );

-- No insert/update/delete policies for "authenticated" or "anon"
-- beyond the ones above, so nobody can edit or delete a request
-- from the client — matches "everything except deleting" staying
-- an intentional, off-app action for this table.
