// ============================================================
// GAKORO MEDIA TV — share-proxy Cloudflare Worker
//
// Deploy this on a Worker Route for:
//   gakoromedia.rw/share/*
//
// It proxies every request straight to the article-og Supabase
// Edge Function, passing the slug through, and forwards that
// function's response (including its Content-Type header) back
// to the browser/crawler unchanged. Kept deliberately thin —
// all the real logic (looking up the article, building the OG
// tags, the redirect) lives in the Edge Function itself, so this
// file stays easy to audit.
//
// Setup:
//   1. Cloudflare dashboard → your zone (gakoromedia.rw) →
//      Workers Routes → Add route:
//        Route:  gakoromedia.rw/share/*
//        Worker: (this script, deployed as e.g. "share-proxy")
//   2. wrangler deploy (or paste this file into the dashboard's
//      Quick Edit box and Save & Deploy).
//   3. Test: https://gakoromedia.rw/share/<any-published-slug>
//      should render real og:title/og:image tags when you view
//      source, and should redirect a normal browser tab straight
//      to the article within an instant.
// ============================================================

const FUNCTION_URL = "https://fidxmzxqftemdcjxykpb.supabase.co/functions/v1/article-og";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Strip the "/share/" prefix to get the slug — everything
    // after it, so slugs with slashes still pass through intact.
    const slug = url.pathname.replace(/^\/share\//, "");

    const target = new URL(FUNCTION_URL);
    if (slug) target.searchParams.set("slug", decodeURIComponent(slug));

    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers: { "User-Agent": request.headers.get("User-Agent") || "" },
    });

    // Re-wrap the response so the Content-Type (text/html) the
    // Edge Function sets is preserved exactly as-is for the
    // browser/crawler — this is the piece that was missing
    // before, which is why the raw HTML source was showing up
    // instead of a rendered/redirecting page.
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "text/html; charset=utf-8",
        "Cache-Control": upstream.headers.get("Cache-Control") || "public, max-age=300",
      },
    });
  },
};
