// ============================================================
// GAKORO MEDIA TV — sitemap-articles Edge Function
//
// Generates a standard XML sitemap listing every published
// article, built fresh from `news_articles` on each request —
// there's no static file to keep in sync as articles are
// published/edited/unpublished.
//
// This function is not meant to be hit directly by users — the
// Cloudflare Worker at cloudflare-worker/sitemap-proxy.js proxies
// https://gakoromedia.rw/sitemap-articles.xml to this function.
// The domain-root sitemap.xml is a small sitemap INDEX that
// points here (and at sitemap-pages.xml for the static pages).
// See sitemap.xml's own comment and that Worker file for setup.
//
// Deploy:
//   supabase functions deploy sitemap-articles --no-verify-jwt
//
// No secrets needed beyond the project's own URL/anon key below,
// which are safe to ship (this mirrors js/config.js and the
// article-og function — the anon key only allows what RLS
// already permits: reading rows with status='published').
// ============================================================

const SUPABASE_URL = "https://fidxmzxqftemdcjxykpb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhtenhxZnRlbWRjanh5a3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzAxNjgsImV4cCI6MjA5OTk0NjE2OH0.52n7B8iAudYcm2U4eVw2Xen2QUol0h5vs1kd9bQ5caM";

const SITE = "https://gakoromedia.rw";

// Sitemaps cap out at 50,000 URLs per file — nowhere close for
// this site, but capped defensively so a single request can't
// balloon unbounded as the archive grows.
const MAX_URLS = 50000;

function xmlEscape(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Short cache — long enough to absorb a crawl burst, short
      // enough that a newly-published article shows up quickly.
      "Cache-Control": "public, max-age=600",
    },
  });
}

Deno.serve(async () => {
  try {
    const apiUrl =
      `${SUPABASE_URL}/rest/v1/news_articles` +
      `?status=eq.published` +
      `&select=slug,published_at,created_at` +
      `&order=published_at.desc` +
      `&limit=${MAX_URLS}`;

    const resp = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!resp.ok) {
      // Fail soft: an empty-but-valid sitemap beats a broken one —
      // a 500 here could make Search Console flag the whole index.
      return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
    }

    const rows: { slug: string; published_at: string | null; created_at: string | null }[] = await resp.json();

    const urls = rows
      .filter((a) => a.slug)
      .map((a) => {
        const loc = `${SITE}/article/?slug=${encodeURIComponent(a.slug)}`;
        const lastmodRaw = a.published_at || a.created_at;
        const lastmod = lastmodRaw ? new Date(lastmodRaw).toISOString().slice(0, 10) : null;
        return (
          `  <url>\n` +
          `    <loc>${xmlEscape(loc)}</loc>\n` +
          (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : "") +
          `    <changefreq>weekly</changefreq>\n` +
          `  </url>`
        );
      })
      .join("\n");

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    return xml(body);
  } catch (err) {
    console.error(err);
    return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
});
