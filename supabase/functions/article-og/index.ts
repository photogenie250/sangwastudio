// ============================================================
// GAKORO MEDIA TV — article-og Edge Function
//
// article/index.html is a JS-rendered shell: it reads ?slug=
// from the URL and fetches the article client-side, so social
// crawlers (Facebook, Twitter/X, WhatsApp, Telegram...) never
// see a real headline, description, or photo when a link is
// shared — they just see the empty shell's static <head>.
//
// This function fixes that. Given a slug, it looks the article
// up in `news_articles` and returns a small, real HTML page
// with proper og:/twitter: meta tags baked in server-side, plus
// a <meta http-equiv="refresh"> + JS redirect that immediately
// bounces real visitors on to the actual article page. Crawlers
// read the <head> and stop there; they don't run the redirect.
//
// This function is not meant to be hit directly by users — the
// Cloudflare Worker at cloudflare-worker/share-proxy.js proxies
// https://gakoromedia.rw/share/<slug> to this function. See that
// file for the deploy/setup steps.
//
// Deploy:
//   supabase functions deploy article-og --no-verify-jwt
//
// No secrets needed beyond the project's own URL/anon key below,
// which are safe to ship (this mirrors js/config.js — the anon
// key only allows what RLS already permits: reading rows with
// status='published').
// ============================================================

const SUPABASE_URL = "https://fidxmzxqftemdcjxykpb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhtenhxZnRlbWRjanh5a3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzAxNjgsImV4cCI6MjA5OTk0NjE2OH0.52n7B8iAudYcm2U4eVw2Xen2QUol0h5vs1kd9bQ5caM";

const SITE = "https://gakoromedia.rw";
const DEFAULT_IMAGE = `${SITE}/assets/gakoro-media-logo.jpg`;

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function html(body: string, status = 200): Response {
  // The bug that broke the share links: without an explicit
  // Content-Type, browsers/crawlers can't tell this is HTML and
  // may render it as plain text. Always set this.
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function notFoundPage(): Response {
  const articleUrl = `${SITE}/article/index.html`;
  return html(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Article not found — Gakoro Media TV</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${articleUrl}">
<script>window.location.replace(${JSON.stringify(articleUrl)});</script>
</head>
<body>
<p>Article not found. <a href="${articleUrl}">Go to Gakoro Media TV</a>&hellip;</p>
</body>
</html>`,
    404
  );
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    // Slug arrives either as a trailing path segment
    // (/article-og/<slug>, matching the Worker's proxy path) or
    // as ?slug=<slug> — support both.
    const pathSlug = url.pathname.split("/").filter(Boolean).pop();
    const slug = url.searchParams.get("slug") || (pathSlug === "article-og" ? "" : pathSlug) || "";

    if (!slug) return notFoundPage();

    const apiUrl =
      `${SUPABASE_URL}/rest/v1/news_articles` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&status=eq.published` +
      `&select=slug,headline,dek,photo_url` +
      `&limit=1`;

    const resp = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!resp.ok) return notFoundPage();

    const rows = await resp.json();
    const a = Array.isArray(rows) ? rows[0] : null;
    if (!a) return notFoundPage();

    const title = `${a.headline} — Gakoro Media TV`;
    const description = a.dek || "GAKORO MEDIA TV news report.";
    const image = a.photo_url || DEFAULT_IMAGE;
    const canonical = `${SITE}/article/index.html?slug=${encodeURIComponent(a.slug)}`;

    const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="GAKORO MEDIA TV">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:url" content="${canonical}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">

<!-- Real visitors (not crawlers) get bounced straight through. -->
<meta http-equiv="refresh" content="0; url=${canonical}">
<script>window.location.replace(${JSON.stringify(canonical)});</script>
</head>
<body>
<p>Redirecting to <a href="${canonical}">${escapeHtml(title)}</a>&hellip;</p>
</body>
</html>`;

    return html(page);
  } catch (err) {
    console.error(err);
    return notFoundPage();
  }
});
