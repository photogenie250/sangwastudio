// ============================================================
// GAKORO MEDIA TV — article-dynamic-render Cloudflare Worker
//
// Deploy this on a Worker Route for:
//   gakoromedia.rw/article/*
//
// Problem: article/index.html is a JS-rendered shell. A real
// browser fetches the article from Supabase client-side and
// fills everything in, which is fine for humans — but search
// crawlers either don't run that JS at all, or only do so on a
// slow, unreliable "second pass," so they were seeing identical,
// empty pages for every article. That's the main reason articles
// weren't showing up in Google search.
//
// Fix: this Worker inspects the request's User-Agent. If it's a
// recognized search/social crawler AND the request has a ?slug=,
// it serves a fully server-rendered version of that article (real
// title, description, canonical, structured data, and the actual
// visible text) from the article-render Supabase Edge Function —
// no JS required to see real content. Every other request (i.e.
// actual visitors) is passed straight through to the origin,
// completely unchanged — same interactive page as always.
//
// This is "dynamic rendering," which Google explicitly documents
// as an acceptable interim solution for JS-heavy sites, as long as
// crawlers and users see equivalent content (they do here — the
// rendered version has the same headline/dek/body/image a human
// sees once the client-side JS finishes):
// https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering
//
// Setup:
//   1. Cloudflare dashboard → your zone (gakoromedia.rw) →
//      Workers Routes → Add route:
//        Route:  gakoromedia.rw/article/*
//        Worker: (this script, deployed as e.g. "article-dynamic-render")
//   2. wrangler deploy (or paste this file into the dashboard's
//      Quick Edit box and Save & Deploy).
//   3. Test as a crawler would see it:
//        curl -A "Googlebot" "https://gakoromedia.rw/article/?slug=<a-published-slug>"
//      should return a full HTML page with a real <title> and
//      visible article text, not the generic JS shell.
//   4. Test as a normal visitor (no special UA) — should load the
//      usual interactive page exactly as before, unaffected.
// ============================================================

const RENDER_FUNCTION_URL = "https://fidxmzxqftemdcjxykpb.supabase.co/functions/v1/article-render";

// Search engines + link-unfurling bots that benefit from getting
// real server-rendered HTML instead of the JS shell. Matched
// case-insensitively against substrings of the User-Agent.
const CRAWLER_UA_PATTERNS = [
  "googlebot",
  "google-inspectiontool",
  "bingbot",
  "duckduckbot",
  "yandex",
  "baiduspider",
  "applebot",
  "facebookexternalhit",
  "facebookcatalog",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "slackbot",
  "discordbot",
  "pinterest",
];

function isCrawler(userAgent) {
  const ua = (userAgent || "").toLowerCase();
  return CRAWLER_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    const userAgent = request.headers.get("User-Agent");

    if (slug && isCrawler(userAgent)) {
      const target = new URL(RENDER_FUNCTION_URL);
      target.searchParams.set("slug", slug);

      const upstream = await fetch(target.toString(), {
        method: "GET",
        headers: { "User-Agent": userAgent || "" },
      });

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "text/html; charset=utf-8",
          "Cache-Control": upstream.headers.get("Cache-Control") || "public, max-age=300",
        },
      });
    }

    // Not a crawler, or no slug (e.g. /article/ with nothing yet) —
    // pass straight through to the normal interactive page.
    return fetch(request);
  },
};
