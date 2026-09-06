-- ============================================================
-- SANGWA STUDIO — article view counts
-- Run once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
--
-- Adds a views_count counter to news_articles, plus an RPC
-- function the public site calls to bump it once per reader per
-- article (js/article.js), and shows it in the admin article
-- list (js/admin.js).
--
-- The counter is NOT writable directly by the anon key (RLS on
-- news_articles only allows public SELECT of published rows).
-- Instead, the `security definer` function below does the write
-- on the anon key's behalf, but only ever by +1 on a published
-- row, so the public can't set an arbitrary count or touch any
-- other column. Same safety pattern as increment_article_likes
-- in add_article_engagement.sql.
-- ============================================================

alter table public.news_articles
  add column if not exists views_count integer not null default 0;

create or replace function public.increment_article_views(p_slug text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.news_articles
  set views_count = views_count + 1
  where slug = p_slug and status = 'published'
  returning views_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.increment_article_views(text) to anon;
