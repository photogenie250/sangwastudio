-- ============================================================
-- GAKORO MEDIA TV — show real emails on the Users tab
-- Run once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
--
-- The admin Users tab (js/admin.js loadUsers) reads
-- public.profiles, which doesn't store an email — only
-- auth.users does, and the anon/authenticated client can't
-- query auth.users directly. This adds an `email` column to
-- profiles, backfills it once from auth.users, and keeps it in
-- sync automatically for every new signup and any future email
-- change, so the Users list always shows a real address instead
-- of a raw UUID.
-- ============================================================

-- 1. Add the column (safe if it already exists).
alter table public.profiles
  add column if not exists email text;

-- 2. Backfill every existing profile from auth.users once.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is distinct from u.email);

-- 3. Keep it in sync going forward: whenever a row is inserted
--    or updated in auth.users (new signup, email change,
--    confirmation, etc.), mirror the email onto profiles.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_sync on auth.users;
create trigger on_auth_user_email_sync
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_email();
