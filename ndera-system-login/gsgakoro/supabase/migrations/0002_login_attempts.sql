-- ============================================================
-- SDMS — Login attempt log (security monitoring)
--
-- Every submit of the login form writes one row here — success
-- or failure — which a Database Webhook relays to WhatsApp via
-- the notify-login-attempt Edge Function. The password is never
-- sent to this table or anywhere else outside Supabase Auth.
-- ============================================================

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  success boolean not null,
  failure_reason text,          -- short machine code, e.g. 'invalid_credentials'
  user_agent text,
  attempted_at timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

-- The login page inserts a row on every attempt. At the moment of
-- insert the caller may still be anonymous (failed attempt) or
-- may already hold a fresh session (successful attempt), so both
-- roles need insert access.
create policy "Login page can log an attempt"
  on public.login_attempts
  for insert
  to anon, authenticated
  with check (true);

-- Only active staff can read the log back.
create policy "Active staff can view login attempts"
  on public.login_attempts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.status = 'active'
    )
  );

-- No update/delete policies at all — the log is append-only from
-- the client, matching how permission_requests is handled.

-- Helpful for the "recent failed attempts for this email" check
-- and for pruning old rows later.
create index if not exists login_attempts_email_time_idx
  on public.login_attempts (email, attempted_at desc);
