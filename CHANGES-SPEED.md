# Speed fixes (Oct 2026)

## What changed
- `article/index.html` — article is fetched from `<head>` before anything else loads; supabase-js no longer blocks reading; Google Fonts no longer blocks rendering; preconnect to Supabase.
- `js/early-article.js` (new) — starts the article request immediately.
- `js/config.js` — shared helpers: `gakoroThumb`, `gakoroFetchArticle`, `gakoroGetArticle`, and tap/hover prefetch of articles (cached 2 min per tab).
- `js/article.js` — renders from the fast fetch; loads supabase-js in the background for likes/views/comments; one shared client; falls back to the old supabase-js query if the fast fetch fails.
- `js/latest-articles.js`, `js/top-stories.js`, `js/category.js` — cards use the small thumbnail.
- `js/admin.js` + `admin/index.html` — every new photo is resized in the browser (full 1280px + thumbnail 560px, WebP) before upload; Media Library shows file sizes, has an Optimize button per heavy photo and an "Optimize heavy photos" button for all.
- `index.html`, `category/index.html` — Google Fonts load without blocking.

## One-time step after deploying
Admin -> Media library -> tap "Optimize heavy photos". This shrinks the three heavy covers
(9.9 MB, 2.4 MB, 2.2 MB) and switches the articles to the new files.

## Not changed
Database, RLS, edge functions and the Cloudflare workers are untouched.

## Portal look (css/portal.css)
Dense, headline-first news layout. Linked at the end of `<head>` in `index.html` and `category/index.html`.
To revert, delete that one `<link>` line. Light/dark mode and your crimson brand colour are kept.
