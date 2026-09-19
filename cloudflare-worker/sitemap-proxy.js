// ============================================================
// GAKORO MEDIA TV — sitemap-proxy Cloudflare Worker
//
// Deploy this on a Worker Route for:
//   gakoromedia.rw/sitemap-articles.xml
//
// It proxies that single URL straight to the sitemap-articles
// Supabase Edge Function and forwards that function's response
// (including its Content-Type header) back unchanged. Kept
// deliberately thin, mirroring share-proxy.js — all the real
// logic (querying published articles, building the XML) lives
// in the Edge Function itself.
//
// The domain-root sitemap.xml is a static sitemap INDEX file
// (see that file) that points both at this URL and at
// sitemap-pages.xml (the static pages, also a plain static
// file) — so nothing needs to route those two, only this one.
//
// Setup:
//   1. Cloudflare dashboard → your zone (gakoromedia.rw) →
//      Workers Routes → Add route:
//        Route:  gakoromedia.rw/sitemap-articles.xml
//        Worker: (this script, deployed as e.g. "sitemap-proxy")
//   2. wrangler deploy (or paste this file into the dashboard's
//      Quick Edit box and Save & Deploy).
//   3. Test: https://gakoromedia.rw/sitemap-articles.xml should
//      return valid XML listing every published article's URL.
//   4. Submit https://gakoromedia.rw/sitemap.xml (the index, not
//      this URL) in Google Search Console.
// ============================================================

const FUNCTION_URL = "https://fidxmzxqftemdcjxykpb.supabase.co/functions/v1/sitemap-articles";

export default {
  async fetch() {
    const upstream = await fetch(FUNCTION_URL, { method: "GET" });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/xml; charset=utf-8",
        "Cache-Control": upstream.headers.get("Cache-Control") || "public, max-age=600",
      },
    });
  },
};
