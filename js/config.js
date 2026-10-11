/* Front-end config, loaded before main.js. Values are set on window (not
   const/let) so including this file twice doesn't throw. */
window.SUPABASE_URL = "https://fidxmzxqftemdcjxykpb.supabase.co"; // e.g. https://xxxxx.supabase.co
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZHhtenhxZnRlbWRjanh5a3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNzAxNjgsImV4cCI6MjA5OTk0NjE2OH0.52n7B8iAudYcm2U4eVw2Xen2QUol0h5vs1kd9bQ5caM";
window.TELEGRAM_USERNAME = "sangwastudio_bot"; // your bot's or studio's Telegram @username, no @

/* ---- YouTube (Gakoro Media TV) ----
   Handled entirely by the Supabase Edge Function
   `get-youtube-videos`. The YouTube API key lives there as a
   secret, never in this file. See README.md section 4 to deploy
   it and set the key. Nothing to fill in here. */

window.sbClient = window.sbClient || null;
try{
  if (
    window.supabase &&
    typeof window.supabase.createClient === "function" &&
    window.SUPABASE_URL.startsWith("https://") &&
    window.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
  ){
    window.sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
}catch(e){ console.warn("Supabase not configured yet:", e); }


/* =====================================================
   SPEED HELPERS (shared by every page that loads config.js)
===================================================== */

/* Cards show a small thumbnail instead of the full cover photo.
   Photos uploaded through the admin are saved twice:
     <name>-o.webp      (full size, ~1280px)
     <name>-o-t.webp    (thumbnail, ~560px)
   Older photos have no thumbnail, so they are returned unchanged. */
window.gakoroThumb = function (url) {
  try {
    return typeof url === "string" ? url.replace(/-o\.(webp|jpg)(\?.*)?$/, "-o-t.$1$2") : url;
  } catch (e) { return url; }
};

/* Fetch one published article with a plain REST call (no supabase-js
   needed, so it can start the instant the page opens). */
window.gakoroFetchArticle = function (slug) {
  var key = window.SUPABASE_ANON_KEY;
  var headers = { apikey: key, Accept: "application/json" };
  if (String(key).indexOf("eyJ") === 0) headers.Authorization = "Bearer " + key;
  var url = window.SUPABASE_URL + "/rest/v1/news_articles?select=*&slug=eq." + encodeURIComponent(slug) +
    "&status=eq.published&published_at=lte." + encodeURIComponent(new Date().toISOString()) + "&limit=1";
  return fetch(url, { headers: headers })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (rows) { return rows && rows[0] ? rows[0] : null; });
};

/* Same as above, but remembers the article for 2 minutes in this tab,
   so an article prefetched on tap/hover opens instantly. */
window.gakoroGetArticle = function (slug) {
  var cacheKey = "gakoro-art-" + slug;
  try {
    var raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      var c = JSON.parse(raw);
      if (c && c.a && Date.now() - c.t < 120000) return Promise.resolve(c.a);
    }
  } catch (e) {}
  window.__gakoroInflight = window.__gakoroInflight || {};
  if (window.__gakoroInflight[slug]) return window.__gakoroInflight[slug];
  var p = window.gakoroFetchArticle(slug).then(function (a) {
    try { if (a) sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), a: a })); } catch (e) {}
    delete window.__gakoroInflight[slug];
    return a;
  }, function (err) {
    delete window.__gakoroInflight[slug];
    throw err;
  });
  window.__gakoroInflight[slug] = p;
  return p;
};

/* Start loading an article the moment a finger touches (or a mouse
   hovers) a link to it. */
(function () {
  var seen = {};
  function onHint(e) {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href*="article/?slug="]') : null;
    if (!a) return;
    var m = /[?&]slug=([^&#]+)/.exec(a.getAttribute("href") || "");
    if (!m) return;
    var slug;
    try { slug = decodeURIComponent(m[1]); } catch (err) { return; }
    if (seen[slug]) return;
    seen[slug] = true;
    window.gakoroGetArticle(slug).catch(function () { seen[slug] = false; });
  }
  document.addEventListener("touchstart", onHint, { passive: true });
  document.addEventListener("mouseover", onHint, { passive: true });
})();
