// ============================================================
// GAKORO MEDIA TV — article-render Edge Function
//
// article/index.html is a JS-rendered shell: its raw HTML has
// the same generic <title>/description on every article, no
// canonical tag, and no visible text at all until client-side
// JS fetches the article from Supabase. Search engines that
// don't fully execute JS see identical, empty pages for every
// article; even Google, which does execute JS, only does so on
// a slow "second wave," so indexing is delayed and low-quality.
// This was the main reason articles weren't showing up in
// Google search.
//
// This function fixes that at the source: given a slug, it
// returns a complete, real HTML document — proper <title>,
// meta description, canonical link, OG/Twitter tags, NewsArticle
// JSON-LD structured data, AND the actual visible headline/dek/
// byline/photo/body text — so crawlers get real, unique, fully-
// formed content on the very first request, no JS required.
//
// This is "dynamic rendering": it is only ever served to known
// crawlers, via the Cloudflare Worker at
// cloudflare-worker/article-dynamic-render.js, which inspects
// the User-Agent on requests to gakoromedia.rw/article/* and
// routes crawler requests here while passing everything else
// straight through to the normal interactive page unchanged.
// The content below matches what a human visitor eventually
// sees after the client-side JS runs — same headline, same
// body, same image — so this doesn't show crawlers anything
// different from what real visitors get (which is what makes
// dynamic rendering acceptable to Google, as opposed to
// cloaking: https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering).
//
// Deploy:
//   supabase functions deploy article-render --no-verify-jwt
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
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function notFoundPage(): Response {
  return html(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Article not found — Gakoro Media TV</title>
<meta name="robots" content="noindex">
</head>
<body>
<p>Article not found. <a href="${SITE}/">Go to Gakoro Media TV</a>.</p>
</body>
</html>`,
    404
  );
}

// Body is stored as plain text; blank lines separate paragraphs —
// same convention js/article.js uses client-side.
function renderBody(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") || "";
    if (!slug) return notFoundPage();

    const apiUrl =
      `${SUPABASE_URL}/rest/v1/news_articles` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&status=eq.published` +
      `&select=slug,headline,dek,category,author,photo_url,photo_caption,gallery_urls,body,breaking,published_at,created_at` +
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
    const canonical = `${SITE}/article/?slug=${encodeURIComponent(a.slug)}`;
    const dateIso = a.published_at || a.created_at;
    const author = a.author || "GAKORO MEDIA TV";
    const gallery: string[] = Array.isArray(a.gallery_urls) ? a.gallery_urls.filter(Boolean).slice(0, 4) : [];

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: a.headline,
      description: a.dek || undefined,
      image: [image],
      datePublished: dateIso || undefined,
      dateModified: dateIso || undefined,
      author: [{ "@type": "Organization", name: author }],
      publisher: {
        "@type": "Organization",
        name: "GAKORO MEDIA TV",
        logo: { "@type": "ImageObject", url: DEFAULT_IMAGE },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    };

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
<meta property="og:url" content="${canonical}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

<style>
  :root{ --navy:#0E1C2B; --crimson:#D3242C; --ink:#1a1a1a; --slate:#5b6472; --line:#e4e4e4; }
  *{box-sizing:border-box;}
  body{ margin:0; background:#fff; color:var(--ink); font-family:Georgia,'Noto Serif',serif; line-height:1.65; }
  .wrap{ max-width:720px; margin:0 auto; padding:32px 20px 64px; }
  .masthead{ background:var(--navy); padding:14px 20px; }
  .masthead a{ color:#fff; text-decoration:none; font-family:Arial,sans-serif; font-weight:800; letter-spacing:.02em; }
  .eyebrow{ font-family:Arial,sans-serif; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--crimson); }
  h1{ font-size:32px; line-height:1.2; margin:10px 0 12px; }
  .dek{ font-size:19px; color:var(--slate); margin:0 0 18px; }
  .byline{ font-family:Arial,sans-serif; font-size:13px; color:var(--slate); border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:10px 0; margin-bottom:22px; }
  img{ max-width:100%; height:auto; display:block; margin:0 0 8px; }
  figcaption{ font-family:Arial,sans-serif; font-size:13px; color:var(--slate); margin-bottom:22px; }
  p{ margin:0 0 18px; font-size:18px; }
  .gallery{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:22px 0; }
  .gallery img{ margin:0; }
  .back{ display:inline-block; margin-top:24px; font-family:Arial,sans-serif; font-size:14px; color:var(--crimson); }
</style>
</head>
<body>
<div class="masthead"><a href="${SITE}/">GAKORO MEDIA TV</a></div>
<div class="wrap">
  <article>
    <div class="eyebrow">${a.breaking ? "Breaking &bull; " : ""}${escapeHtml(a.category || "Latest")}</div>
    <h1>${escapeHtml(a.headline)}</h1>
    ${a.dek ? `<p class="dek">${escapeHtml(a.dek)}</p>` : ""}
    <div class="byline">${escapeHtml(author)}${dateIso ? ` &bull; ${formatDate(dateIso)}` : ""}</div>
    ${a.photo_url ? `<img src="${escapeHtml(a.photo_url)}" alt="${escapeHtml(a.headline)}">` : ""}
    ${a.photo_caption ? `<figcaption>${escapeHtml(a.photo_caption)}</figcaption>` : ""}
    ${renderBody(a.body || "")}
    ${gallery.length ? `<div class="gallery">${gallery.map((u) => `<img src="${escapeHtml(u)}" alt="">`).join("")}</div>` : ""}
    <a class="back" href="${canonical}">Read and comment on Gakoro Media TV &rarr;</a>
  </article>
</div>
</body>
</html>`;

    return html(page);
  } catch (err) {
    console.error(err);
    return notFoundPage();
  }
});
