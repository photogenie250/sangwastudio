/* Article page. Reads ?slug= from the URL, loads the published article and
   renders it. Shows a message if the slug is missing or the article isn't
   published. */
(function () {
  const main = document.getElementById("articleMain");
  const yearEl = document.getElementById("yearNow");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }


  // supabase-js loads after the article is on screen (early-article.js
  // fetches the article itself). Only likes, views and comments need it
  let sbLibPromise = null;
  function ensureSupabase() {
    if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve();
    if (sbLibPromise) return sbLibPromise;
    sbLibPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { sbLibPromise = null; reject(new Error("supabase-js failed to load")); };
      document.head.appendChild(s);
    });
    return sbLibPromise;
  }
  function getClient() {
    if (!window.sbClient) {
      window.sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return window.sbClient;
  }

  function renderState(eyebrow, title, message, showHomeLink) {
    main.innerHTML = `
      <div class="state-box">
        <div class="eyebrow">${escapeHtml(eyebrow)}</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        ${showHomeLink ? '<a class="btn" href="/">Back to Gakoro Media TV</a>' : ""}
      </div>
    `;
  }

  // only render the ad unit if the visitor already accepted cookies
  function renderAdSlot() {
    if (localStorage.getItem("gakoro-cookie-consent") !== "accepted") return "";
    return `<ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-2056887490896774"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>`;
  }

  // ask AdSense to fill any empty ad slot (safe to call early, it queues)
  function requestAdFill() {
    document.querySelectorAll("ins.adsbygoogle:not([data-ad-status])").forEach(function () {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        /* ignore, e.g. ad blocker */
      }
    });
  }

  // if cookies are accepted after the article rendered, add the ad slot now
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

  // up to 4 extra photos (gallery_urls column), shown after the report text
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

  function setMeta(attr, key, content) {
    if (!content) return;
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function renderArticle(a) {
    const title = `${a.headline} — Gakoro Media TV`;
    const description = a.dek || "GAKORO MEDIA TV news report.";
    const image = a.photo_url || `${window.location.origin}/assets/gakoro-media-logo.jpg`;
    const canonicalUrl = `${window.location.origin}/article/?slug=${encodeURIComponent(a.slug)}`;

    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);

    // canonical link, so every article isn't treated as a copy of /article/
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute("href", canonicalUrl);

    setMeta("property", "og:type", "article");
    setMeta("property", "og:site_name", "GAKORO MEDIA TV");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);

    // NewsArticle structured data for Google
    let ldScript = document.getElementById("articleJsonLd");
    if (!ldScript) {
      ldScript = document.createElement("script");
      ldScript.type = "application/ld+json";
      ldScript.id = "articleJsonLd";
      document.head.appendChild(ldScript);
    }
    ldScript.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: a.headline,
      description: a.dek || undefined,
      image: [image],
      datePublished: a.published_at || a.created_at || undefined,
      dateModified: a.published_at || a.created_at || undefined,
      author: [{ "@type": "Organization", name: a.author || "GAKORO MEDIA TV" }],
      publisher: {
        "@type": "Organization",
        name: "GAKORO MEDIA TV",
        logo: { "@type": "ImageObject", url: `${window.location.origin}/assets/gakoro-media-logo.jpg` },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    });

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
        <img src="${escapeHtml(a.photo_url)}" alt="${escapeHtml(a.headline)}" loading="eager" fetchpriority="high" decoding="async">
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
        <div class="comments-empty" id="commentsEmpty" style="display:none;">No comments yet. Be the first to say something.</div>
        <div class="comment-list" id="commentList"></div>
      </section>
    `;

    wireUpLike(a);
    wireUpShare(a);
    requestAdFill();
    ensureSupabase()
      .then(function () {
        wireUpComments(a);
        wireUpViews(a);
      })
      .catch(function (err) {
        console.warn("Gakoro Media TV: comments/views unavailable.", err);
        const section = document.getElementById("commentsSection");
        if (section) section.style.display = "none";
      });
  }

  // No sign-in. localStorage stops repeat likes from the same browser; the
  // +1 goes through the increment_article_likes RPC
  // (sql/add_article_engagement.sql)
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
      if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return;
      likeBtn.disabled = true;
      try {
        await ensureSupabase();
        const client = getClient();
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

  // Counts once per article per tab session (sessionStorage). The +1 goes
  // through the increment_article_views RPC (sql/add_article_views.sql)
  function wireUpViews(a) {
    const viewsCountNumEl = document.getElementById("viewsCountNum");
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) return;

    const viewedKey = `gakoro-viewed-${a.slug}`;
    if (sessionStorage.getItem(viewedKey)) return; // already counted this session

    (async () => {
      try {
        const client = getClient();
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

  // native share sheet where supported, otherwise copy the link
  function wireUpShare(a) {
    const shareBtn = document.getElementById("shareBtn");
    const shareBtnLabel = document.getElementById("shareBtnLabel");
    if (!shareBtn) return;

    // share the /share/ link so crawlers get real og tags (the article page
    // is rendered by JS). A Cloudflare Worker proxies it to the article-og
    // function, see cloudflare-worker/share-proxy.js. Falls back to the plain
    // article URL
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

  // public read/insert on article_comments (sql/add_article_comments.sql),
  // no sign-in. Spam guards: honeypot field, client-side cooldown, and length
  // limits that match the database
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

    const client = getClient();
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
        // honeypot tripped: pretend it worked, insert nothing
        form.reset();
        showMsg("Thanks, your comment was posted.", true);
        return;
      }
      if (!name) { showMsg("Add your name first.", false); return; }
      if (!comment) { showMsg("Write a comment before posting.", false); return; }
      if (name.length > 80) { showMsg("Name is too long.", false); return; }
      if (comment.length > 2000) { showMsg("Comment is too long (max 2000 characters).", false); return; }

      const lastPosted = Number(localStorage.getItem("gakoro-comment-last") || 0);
      if (Date.now() - lastPosted < COMMENT_COOLDOWN_MS) {
        showMsg("You're posting a bit fast, please wait a few seconds and try again.", false);
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

    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      renderState("Unavailable", "News desk is offline", "The article system isn't configured yet. Please check back soon.", true);
      return;
    }

    // load supabase-js in the background (likes, views, comments)
    ensureSupabase().catch(function () {});

    try {
      let data;
      try {
        // Fast path: fetched by the <head> script (or prefetched on tap).
        data = await (window.__gakoroArticle || window.gakoroGetArticle(slug));
      } catch (fastErr) {
        // Fallback: the original supabase-js query.
        console.warn("Gakoro Media TV: fast fetch failed, retrying with supabase-js.", fastErr);
        await ensureSupabase();
        const res = await getClient()
          .from("news_articles")
          .select("*")
          .eq("slug", slug)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .maybeSingle();
        if (res.error) throw res.error;
        data = res.data;
      }

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

  // script is deferred, so the page is already parsed
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
