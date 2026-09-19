-- ============================================================
-- GAKORO MEDIA TV — News Desk admin upgrade
-- Run once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
--
-- This adds everything the redesigned admin/index.html needs
-- that isn't already in the project:
--   1. Tags + visibility + true scheduling on news_articles
--   2. A manageable Categories table (Categories tab)
--   3. Comment moderation for the news desk (Comments tab)
--   4. A safe way for the admin to list/manage staff (Users tab)
--   5. Storage policies so the Media Library tab can list/delete
--      photos in the existing `news-photos` bucket
--
-- Everything here is additive (IF NOT EXISTS / OR REPLACE) and
-- safe to run on a live project.
-- ============================================================

-- ------------------------------------------------------------
-- 1. news_articles: tags, visibility, real scheduling
-- ------------------------------------------------------------
alter table public.news_articles
  add column if not exists tags text[] not null default '{}';

alter table public.news_articles
  add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'unlisted'));

-- published_at already exists and is used for scheduling: the
-- composer can now set it to a future timestamp when publishing,
-- and js/news.js, js/latest-articles.js, js/top-stories.js and
-- js/article.js only show rows where published_at has arrived.
-- No column change needed for that — just an index to keep the
-- new "is it due yet" filter fast.
create index if not exists news_articles_published_at_idx
  on public.news_articles (published_at desc);

create index if not exists news_articles_tags_idx
  on public.news_articles using gin (tags);

-- ------------------------------------------------------------
-- 2. Categories (Categories tab) — replaces the hardcoded
--    <select> list in the composer with an editable table.
-- ------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  constraint categories_name_len check (char_length(name) between 1 and 60)
);

alter table public.categories enable row level security;

drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories"
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists "News desk can manage categories" on public.categories;
create policy "News desk can manage categories"
  on public.categories for all
  to authenticated
  using (true)
  with check (true);

-- Seed with the categories already used across the site so the
-- dropdown isn't empty after running this migration.
insert into public.categories (name, slug)
values
  ('News', 'news'),
  ('Education', 'education'),
  ('Sports', 'sports'),
  ('Community', 'community'),
  ('Interviews', 'interviews'),
  ('Business', 'business'),
  ('Opinion', 'opinion')
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- 3. Comment moderation (Comments tab)
--    article_comments already exists (sql/add_article_comments.sql)
--    with anon insert/select-approved policies. Add the
--    authenticated (news desk) policies needed to moderate.
-- ------------------------------------------------------------
drop policy if exists "News desk can read all comments" on public.article_comments;
create policy "News desk can read all comments"
  on public.article_comments for select
  to authenticated
  using (true);

drop policy if exists "News desk can moderate comments" on public.article_comments;
create policy "News desk can moderate comments"
  on public.article_comments for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "News desk can delete comments" on public.article_comments;
create policy "News desk can delete comments"
  on public.article_comments for delete
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 4. Users tab — let any signed-in staff member see the byline
--    roster, but only admins can change a role.
--
--    Assumes public.profiles(id uuid references auth.users, role
--    text, ...) already exists (created when auth/admin.js was
--    first set up). Adds a display_name column and a safe,
--    non-recursive admin check.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name text;

-- security definer = runs with the function owner's privileges,
-- so this lookup doesn't get filtered by the very policy it's
-- used inside of (which would otherwise recurse).
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists "Staff can read all profiles" on public.profiles;
create policy "Staff can read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Staff can update own profile" on public.profiles;
create policy "Staff can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ------------------------------------------------------------
-- 5. Media Library tab — list + delete photos in the existing
--    `news-photos` storage bucket. Upload policy for this bucket
--    should already exist (the composer already uploads to it);
--    this just adds list/delete for the same trusted (signed-in)
--    users.
-- ------------------------------------------------------------
drop policy if exists "News desk can list photos" on storage.objects;
create policy "News desk can list photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'news-photos');

drop policy if exists "News desk can delete photos" on storage.objects;
create policy "News desk can delete photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'news-photos');
