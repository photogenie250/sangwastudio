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

  // Only render the AdSense unit if the visitor already accepted the
  // cookie banner (same "gakoro-cookie-consent" key js/consent.js
  // uses) — keeps ad cookies from ever being set before consent.
  function renderAdSlot() {
    if (localStorage.getItem("gakoro-cookie-consent") !== "accepted") return "";
    return `<ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-2056887490896774"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>`;
  }

  // Ask AdSense to fill any not-yet-filled <ins class="adsbygoogle">
  // on the page. Safe to call repeatedly / before the library has
  // loaded — window.adsbygoogle is a queue AdSense drains once ready.
  function requestAdFill() {
    document.querySelectorAll("ins.adsbygoogle:not([data-ad-status])").forEach(function () {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        /* ignore — e.g. ad blocker present */
      }
    });
  }

  // If the visitor accepts the cookie banner AFTER the article has
  // already rendered (so renderAdSlot() ran too early to include the
  // <ins> tag), backfill it now.
  document.addEventListener("gakoro-ads-consent-accepted", function () {
    const slot = document.getElementById("inArticleAdSlot");
    if (slot && !slot.querySelector("ins.adsbygoogle")) {
      slot.innerHTML = renderAdSlot();
      requestAdFill();
    }
  });

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

  const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>';
  const HEART_ICON = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10.2-9.3C.2 8.8 1.6 5 5.3 4.2c2-.4 3.9.4 5.1 2.1l1.6 2.2 1.6-2.2c1.2-1.7 3.1-2.5 5.1-2.1 3.7.8 5.1 4.6 3.5 7.5C19.5 16.4 12 21 12 21z"/></svg>';
  const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  function formatCount(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 >= 100 ? 1 : 0) + "K";
    return String(n);
  }

  // Up to 4 extra photos, shown as a grid right after the report text
  // (set from the admin composer's "More photos" field, stored in the
  // `gallery_urls` column). Renders nothing if the article has none.
  function renderGallery(a) {
    const urls = Array.isArray(a.gallery_urls) ? a.gallery_urls.filter(Boolean).slice(0, 4) : [];
    if (!urls.length) return "";
    return `
      <div class="art-gallery">
        ${urls
          .map(
            (url) => `
          <div class="art-gallery-item">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(a.headline)} — additional photo" loading="lazy">
          </div>`
          )
          .join("")}
      </div>
    `;
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
        <div class="art-stats">
          <span class="views-count" id="viewsCount" title="Views">
            ${EYE_ICON}<span id="viewsCountNum">${formatCount(a.views_count)}</span>
          </span>
          <button type="button" class="like-btn" id="likeBtn" aria-pressed="false">
            ${HEART_ICON}<span id="likesCount">${formatCount(a.likes_count)}</span>
          </button>
          <button type="button" class="share-btn" id="shareBtn">
            ${SHARE_ICON}<span id="shareBtnLabel">Share</span>
          </button>
        </div>
      </div>
      <div class="art-photo-wrap">
        <img src="${escapeHtml(a.photo_url)}" alt="${escapeHtml(a.headline)}" loading="eager">
      </div>
      ${a.photo_caption ? `<div class="art-photo-caption">${escapeHtml(a.photo_caption)}</div>` : '<div style="margin-bottom:34px;"></div>'}
      <div class="report-box">
        <div class="report-label">The report</div>
        <div class="report-body">${renderBody(a.body)}</div>
      </div>

      ${renderGallery(a)}

      <!-- In-article AdSense unit. Uses "auto" display format so it
           works without creating a specific ad unit in the AdSense
           dashboard first. Only rendered if consent was already
           accepted (see renderAdSlot() below); stays empty/invisible
           otherwise via .ad-slot:empty in CSS. -->
      <div class="ad-slot" id="inArticleAdSlot">${renderAdSlot()}</div>

      <section class="comments-section" id="commentsSection">
        <h2 class="comments-heading">Comments <span class="count" id="commentCount"></span></h2>

        <form class="comment-form" id="commentForm" novalidate>
          <div class="comment-form-row">
            <input type="text" id="commentName" name="name" placeholder="Your name" maxlength="80" autocomplete="name" required>
          </div>
          <div class="comment-form-row">
            <textarea id="commentBody" name="comment" placeholder="Join the discussion&hellip;" maxlength="2000" required></textarea>
          </div>
          <!-- honeypot: real visitors never see or fill this in; bots often do -->
          <div class="comment-hp" aria-hidden="true">
            <label for="commentWebsite">Website</label>
            <input type="text" id="commentWebsite" name="website" tabindex="-1" autocomplete="off">
          </div>
          <div class="comment-form-foot">
            <span class="comment-char-count" id="commentCharCount">0 / 2000</span>
            <button type="submit" class="comment-submit-btn" id="commentSubmitBtn">Post comment</button>
          </div>
          <div class="comment-form-msg" id="commentFormMsg"></div>
        </form>

        <div class="comments-loading" id="commentsLoading">Loading comments&hellip;</div>
        <div class="comments-empty" id="commentsEmpty" style="display:none;">No comments yet — be the first to say something.</div>
        <div class="comment-list" id="commentList"></div>
      </section>
    `;

    wireUpLike(a);
    wireUpShare(a);
    wireUpComments(a);
    wireUpViews(a);
    requestAdFill();
  }

  // ---------- Like ----------
  // No sign-in — just a per-browser guard via localStorage so the
  // same visitor can't rack up the count by repeat-clicking. The
  // actual +1 happens server-side via the increment_article_likes
  // RPC (see sql/add_article_engagement.sql), which is the only
  // way the public key is allowed to touch this column.
  function wireUpLike(a) {
    const likeBtn = document.getElementById("likeBtn");
    const likesCountEl = document.getElementById("likesCount");
    if (!likeBtn) return;

    const likedKey = `gakoro-liked-${a.slug}`;
    if (localStorage.getItem(likedKey)) {
      likeBtn.classList.add("liked");
      likeBtn.setAttribute("aria-pressed", "true");
    }

    likeBtn.addEventListener("click", async () => {
      if (localStorage.getItem(likedKey)) return; // already liked from this browser
      if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return;
      likeBtn.disabled = true;
      try {
        const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        const { data, error } = await client.rpc("increment_article_likes", { p_slug: a.slug });
        if (error) throw error;
        localStorage.setItem(likedKey, "1");
        likeBtn.classList.add("liked");
        likeBtn.setAttribute("aria-pressed", "true");
        likesCountEl.textContent = typeof data === "number" ? formatCount(data) : formatCount((Number(a.likes_count) || 0) + 1);
      } catch (err) {
        console.warn("Gakoro Media TV: couldn't record like.", err);
      } finally {
        likeBtn.disabled = false;
      }
    });
  }

  // ---------- Views ----------
  // Fires once automatically per article per browser tab session
  // (sessionStorage, not localStorage — so re-opening the article
  // in a new visit later still counts, but refreshing or navigating
  // back and forth within the same session doesn't inflate the
  // count). The actual +1 happens server-side via the
  // increment_article_views RPC (see sql/add_article_views.sql),
  // the only way the public key is allowed to touch this column.
  function wireUpViews(a) {
    const viewsCountNumEl = document.getElementById("viewsCountNum");
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return;

    const viewedKey = `gakoro-viewed-${a.slug}`;
    if (sessionStorage.getItem(viewedKey)) return; // already counted this session

    (async () => {
      try {
        const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        const { data, error } = await client.rpc("increment_article_views", { p_slug: a.slug });
        if (error) throw error;
        sessionStorage.setItem(viewedKey, "1");
        if (viewsCountNumEl) {
          viewsCountNumEl.textContent = typeof data === "number" ? formatCount(data) : formatCount((Number(a.views_count) || 0) + 1);
        }
      } catch (err) {
        console.warn("Gakoro Media TV: couldn't record view.", err);
      }
    })();
  }

  // ---------- Share ----------
  // Uses the native share sheet on phones/browsers that support it
  // (navigator.share). Everywhere else, falls back to copying the
  // article's link to the clipboard with a brief "Copied!" state.
  // renderArticle() calls this for every article rendered here, so
  // it applies to every published article, not just one.
  function wireUpShare(a) {
    const shareBtn = document.getElementById("shareBtn");
    const shareBtnLabel = document.getElementById("shareBtnLabel");
    if (!shareBtn) return;

    // Share a link that returns real og:title/og:description/og:image
    // tags (article/index.html itself is a JS-rendered shell that
    // crawlers can't see into). This hits the gakoromedia.rw domain —
    // a Cloudflare Worker Route on /share/* proxies it to the Supabase
    // article-og Edge Function behind the scenes (see
    // cloudflare-worker/share-proxy.js). Falls back to the plain page
    // URL if that Worker route isn't set up yet.
    const shareUrl = `https://gakoromedia.rw/share/${encodeURIComponent(a.slug)}`;

    async function copyFallback() {
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch (err) {
        const tmp = document.createElement("textarea");
        tmp.value = shareUrl;
        tmp.style.position = "fixed";
        tmp.style.opacity = "0";
        document.body.appendChild(tmp);
        tmp.select();
        try { document.execCommand("copy"); } catch (e) { /* ignore */ }
        document.body.removeChild(tmp);
      }
      shareBtn.classList.add("copied");
      shareBtnLabel.textContent = "Copied!";
      setTimeout(() => {
        shareBtn.classList.remove("copied");
        shareBtnLabel.textContent = "Share";
      }, 1800);
    }

    shareBtn.addEventListener("click", async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: a.headline, text: a.dek || a.headline, url: shareUrl });
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return; // user cancelled the share sheet
        }
      }
      copyFallback();
    });
  }

  // ---------- Comments ----------
  // Public read/insert against `article_comments` (see
  // sql/add_article_comments.sql). No sign-in required — matches
  // the rest of the site's "no accounts" philosophy. Basic abuse
  // guards: a hidden honeypot field, a client-side cooldown so one
  // visitor can't machine-gun the form, and length limits that
  // mirror the database constraints.
  const COMMENT_COOLDOWN_MS = 20000; // 20s between posts, per browser

  function formatCommentDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderCommentList(rows) {
    const list = document.getElementById("commentList");
    const empty = document.getElementById("commentsEmpty");
    const countEl = document.getElementById("commentCount");
    if (!list) return;

    countEl.textContent = rows.length ? `(${formatCount(rows.length)})` : "";

    if (!rows.length) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    list.innerHTML = rows
      .map(
        (c) => `
      <div class="comment-item">
        <div class="comment-item-head">
          <span class="comment-author">${escapeHtml(c.name)}</span>
          <span class="comment-date">${formatCommentDate(c.created_at)}</span>
        </div>
        <div class="comment-body">${escapeHtml(c.comment)}</div>
      </div>`
      )
      .join("");
  }

  async function loadComments(client, slug) {
    const loading = document.getElementById("commentsLoading");
    try {
      const { data, error } = await client
        .from("article_comments")
        .select("name, comment, created_at")
        .eq("article_slug", slug)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (loading) loading.style.display = "none";
      renderCommentList(data || []);
    } catch (err) {
      console.warn("Gakoro Media TV: couldn't load comments.", err);
      if (loading) loading.textContent = "Comments aren't available right now.";
    }
  }

  function wireUpComments(a) {
    const section = document.getElementById("commentsSection");
    const form = document.getElementById("commentForm");
    if (!section || !form) return;

    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
      section.style.display = "none";
      return;
    }

    const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    loadComments(client, a.slug);

    const nameEl = document.getElementById("commentName");
    const bodyEl = document.getElementById("commentBody");
    const websiteEl = document.getElementById("commentWebsite"); // honeypot
    const charCountEl = document.getElementById("commentCharCount");
    const submitBtn = document.getElementById("commentSubmitBtn");
    const msgEl = document.getElementById("commentFormMsg");

    function showMsg(text, ok) {
      msgEl.textContent = text;
      msgEl.className = "comment-form-msg show " + (ok ? "ok" : "err");
    }

    bodyEl.addEventListener("input", () => {
      charCountEl.textContent = `${bodyEl.value.length} / 2000`;
    });

    // Restore a saved name for convenience on repeat visits.
    const savedName = localStorage.getItem("gakoro-comment-name");
    if (savedName) nameEl.value = savedName;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = nameEl.value.trim();
      const comment = bodyEl.value.trim();

      if (websiteEl && websiteEl.value.trim()) {
        // Honeypot tripped — silently pretend it worked, don't insert anything.
        form.reset();
        showMsg("Thanks — your comment was posted.", true);
        return;
      }
      if (!name) { showMsg("Add your name first.", false); return; }
      if (!comment) { showMsg("Write a comment before posting.", false); return; }
      if (name.length > 80) { showMsg("Name is too long.", false); return; }
      if (comment.length > 2000) { showMsg("Comment is too long (max 2000 characters).", false); return; }

      const lastPosted = Number(localStorage.getItem("gakoro-comment-last") || 0);
      if (Date.now() - lastPosted < COMMENT_COOLDOWN_MS) {
        showMsg("You're posting a bit fast — please wait a few seconds and try again.", false);
        return;
      }

      submitBtn.disabled = true;
      showMsg("Posting\u2026", true);

      try {
        const { error } = await client.from("article_comments").insert({
          article_slug: a.slug,
          name,
          comment,
          status: "approved",
        });
        if (error) throw error;

        localStorage.setItem("gakoro-comment-name", name);
        localStorage.setItem("gakoro-comment-last", String(Date.now()));
        bodyEl.value = "";
        charCountEl.textContent = "0 / 2000";
        showMsg("Comment posted.", true);
        await loadComments(client, a.slug);
      } catch (err) {
        console.error("Gakoro Media TV: couldn't post comment.", err);
        showMsg("Couldn't post your comment. Please try again.", false);
      } finally {
        submitBtn.disabled = false;
      }
    });
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
