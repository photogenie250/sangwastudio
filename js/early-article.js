/* Starts fetching the article as soon as the page opens, before supabase-js
   or article.js load. article.js reads the result from
   window.__gakoroArticle. Needs config.js first. */
(function () {
  var slug = new URLSearchParams(location.search).get("slug");
  if (!slug || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.gakoroGetArticle) return;
  window.__gakoroArticle = window.gakoroGetArticle(slug);
  window.__gakoroArticle.catch(function () {}); // article.js handles errors
})();
