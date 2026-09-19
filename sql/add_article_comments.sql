-- ============================================================
-- GAKORO MEDIA TV — article comments
-- Run once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
--
-- Adds a comments table for the article page (article/index.html
-- + js/article.js). Comments are keyed by the article's `slug`
-- (not a foreign key, so comments still work even if you delete
-- and re-publish an article under the same slug).
--
-- Moderation model, matching the rest of this project (no admin
-- back-end required to launch):
--   - Comments are inserted with status = 'approved' by default,
--     so they appear immediately — good for a small local news
--     site that wants a live conversation under each story.
--   - You can hide any comment at any time from Supabase's
--     Table Editor → article_comments by changing its status to
--     'hidden' (or deleting the row). The public site only ever
--     SELECTs rows with status = 'approved'.
--   - If you'd rather review comments BEFORE they go live, change
--     the DEFAULT below from 'approved' to 'pending' — the public
--     site code needs no changes either way.
-- ============================================================

create table if not exists public.article_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  article_slug text not null,
  name text not null,
  comment text not null,
  status text not null default 'approved' check (status in ('approved','pending','hidden')),
  constraint article_comments_name_len check (char_length(name) between 1 and 80),
  constraint article_comments_comment_len check (char_length(comment) between 1 and 2000)
);

create index if not exists article_comments_slug_idx
  on public.article_comments (article_slug, created_at desc);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
-- The public anon key can INSERT a comment and SELECT only
-- approved comments. It can never UPDATE, DELETE, or read
-- pending/hidden comments — that's done by you, signed in as
-- the project owner, from the Table Editor (same pattern as
-- orders/messages in schema.sql).
-- ------------------------------------------------------------

alter table public.article_comments enable row level security;

drop policy if exists "Public can read approved comments" on public.article_comments;
create policy "Public can read approved comments"
  on public.article_comments for select
  to anon
  using (status = 'approved');

drop policy if exists "Public can post comments" on public.article_comments;
create policy "Public can post comments"
  on public.article_comments for insert
  to anon
  with check (status = 'approved' or status = 'pending');

-- ------------------------------------------------------------
-- Optional: simple per-article comment counter used by the
-- article list / homepage if you want to show "12 comments"
-- next to an article later. Safe to ignore if you don't need it.
-- ------------------------------------------------------------
create or replace view public.article_comment_counts as
  select article_slug, count(*)::int as comment_count
  from public.article_comments
  where status = 'approved'
  group by article_slug;

grant select on public.article_comment_counts to anon;
