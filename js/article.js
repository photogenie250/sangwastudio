/* =====================================================
   GAKORO MEDIA TV — article page loader.

   Reads ?slug=... from the URL, fetches that article from
   the Supabase `news_articles` table (RLS only allows public
   reads of rows with status='published'), and renders the
   photo + headline + report box. Shows a friendly state if
   the slug is missing, unpublished, or the article doesn't
   exist.
===================================================== */
(function () {
  const main = document.getElementById("articleMain");
  const yearEl = document.getElementById("yearNow");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderState(eyebrow, title, message, showHomeLink) {
    main.innerHTML = `
      <div class="state-box">
        <div class="eyebrow">${escapeHtml(eyebrow)}</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${showHomeLink ? '<a class="btn" href="index.html">Back to Gakoro Media TV</a>' : ""}
      </div>
    `;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Body is stored as plain text; blank lines separate paragraphs.
  function renderBody(body) {
    return body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
  }

  function renderArticle(a) {
    document.title = `${a.headline} — Gakoro Media TV`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && a.dek) metaDesc.setAttribute("content", a.dek);

    main.innerHTML = `
      <div class="art-meta-row">
        ${a.breaking ? '<span class="breaking-tag">Breaking</span>' : ""}
        <span>${escapeHtml(a.category || "Latest")}</span>
      </div>
      <h1 class="art-headline">${escapeHtml(a.headline)}</h1>
      ${a.dek ? `<p class="art-dek">${escapeHtml(a.dek)}</p>` : ""}
      <div class="art-byline">
        <span>${escapeHtml(a.author || "GAKORO MEDIA TV")}</span>
        <span class="sep">&bull;</span>
        <span>${formatDate(a.published_at || a.created_at)}</span>
      </div>
      <div class="art-photo-wrap">
        <img src="${escapeHtml(a.photo_url)}" alt="${escapeHtml(a.headline)}" loading="eager">
      </div>
      ${a.photo_caption ? `<div class="art-photo-caption">${escapeHtml(a.photo_caption)}</div>` : '<div style="margin-bottom:34px;"></div>'}
      <div class="report-box">
        <div class="report-label">The report</div>
        <div class="report-body">${renderBody(a.body)}</div>
      </div>
    `;
  }

  async function init() {
    const slug = new URLSearchParams(window.location.search).get("slug");
    if (!slug) {
      renderState("Not found", "No article specified", "This link is missing an article to show.", true);
      return;
    }

    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
      renderState("Unavailable", "News desk is offline", "The article system isn't configured yet. Please check back soon.", true);
      return;
    }

    try {
      const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data, error } = await client
        .from("news_articles")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        renderState("Not found", "Article not available", "This report may have been unpublished or the link is incorrect.", true);
        return;
      }

      renderArticle(data);
    } catch (err) {
      console.error("Gakoro Media TV: could not load article.", err);
      renderState("Error", "Couldn't load this report", "Something went wrong fetching this article. Please try again shortly.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
