-- ============================================================
-- SANGWA STUDIO — article likes
-- Run once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
--
-- Adds a likes_count counter to news_articles, plus an RPC
-- function the public site calls to bump it when a reader taps
-- "Like" on an article (js/article.js).
--
-- The counter is NOT writable directly by the anon key (RLS on
-- news_articles only allows public SELECT of published rows).
-- Instead, the `security definer` function below does the write
-- on the anon key's behalf, but only ever by +1 on a published
-- row, so the public can't set an arbitrary count or touch any
-- other column.
-- ============================================================

alter table public.news_articles
  add column if not exists likes_count integer not null default 0;

create or replace function public.increment_article_likes(p_slug text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.news_articles
  set likes_count = likes_count + 1
  where slug = p_slug and status = 'published'
  returning likes_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.increment_article_likes(text) to anon;
