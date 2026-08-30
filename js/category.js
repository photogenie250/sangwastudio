/* =====================================================
   GAKORO MEDIA TV — category page.

   Reads ?cat=<Category> from the URL, fetches published
   articles from Supabase `news_articles` whose `category`
   matches (case-insensitively), and renders them as cards
   into category/index.html's #catGrid, with a "Load more"
   button for pagination. Highlights the matching nav/footer
   link and updates the page title/heading.

   An empty ?cat= (or a missing one) is treated as "all
   categories" — used by the plain "News" link, which just
   shows everything, same spirit as the homepage feed.
===================================================== */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  const PAGE_SIZE = 12;

  const grid = document.getElementById("catGrid");
  const catTitleEl = document.getElementById("catTitle");
  const catSubEl = document.getElementById("catSub");
  const pageTitleEl = document.getElementById("pageTitle");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  const params = new URLSearchParams(window.location.search);
  const cat = (params.get("cat") || "").trim();

  let offset = 0;
  let client = null;

  // ---------- heading + active nav state ----------
  if (cat) {
    catTitleEl.textContent = cat;
    catSubEl.textContent = `Latest ${cat.toLowerCase()} stories from Gakoro Media TV.`;
    pageTitleEl.textContent = `${cat} — Gakoro Media TV`;
  } else {
    catTitleEl.textContent = "All Articles";
    catSubEl.textContent = "Every story published on Gakoro Media TV.";
    pageTitleEl.textContent = "Articles — Gakoro Media TV";
  }
  // Nav/footer links + active-state are owned by js/nav-categories.js,
  // which also keeps them in sync with admin's Categories table.

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    grid.innerHTML = `<div class="empty-state">Couldn't load articles right now. <a href="../index.html">Back to homepage</a></div>`;
    return;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function formatCount(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 >= 100 ? 1 : 0) + "K";
    return String(n);
  }

  function formatAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }

  function shareUrlFor(slug) {
    return `https://gakoromedia.rw/share/${encodeURIComponent(slug)}`;
  }

  function wireShareButton(btn, a) {
    if (!btn) return;
    const label = btn.querySelector(".stat-share-label");
    const url = shareUrlFor(a.slug);

    async function copyFallback() {
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        const tmp = document.createElement("textarea");
        tmp.value = url;
        tmp.style.position = "fixed";
        tmp.style.opacity = "0";
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        document.body.removeChild(tmp);
      }
      btn.classList.add("copied");
      if (label) label.textContent = "Copied!";
      setTimeout(() => {
        btn.classList.remove("copied");
        if (label) label.textContent = "Share";
      }, 1800);
    }

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (navigator.share) {
        try {
          await navigator.share({ title: a.headline, text: a.dek || a.headline, url });
        } catch (err) {
          if (err && err.name === "AbortError") return;
          await copyFallback();
        }
      } else {
        await copyFallback();
      }
    });
  }

  function cardHtml(a, idx) {
    const thumbStyle = a.photo_url
      ? `style="background-image:url('${a.photo_url}'); background-size:cover; background-position:center;"`
      : "";
    return `
      <a class="card" href="../article/index.html?slug=${encodeURIComponent(a.slug)}" aria-label="Read &quot;${escapeHtml(a.headline)}&quot;">
        <div class="card-thumb" ${thumbStyle}></div>
        <div class="card-body">
          <div class="card-cat">${escapeHtml((a.category || "News").toUpperCase())}</div>
          <div class="card-title">${escapeHtml(a.headline)}</div>
          ${a.dek ? `<div class="card-dek">${escapeHtml(a.dek)}</div>` : ""}
          <div class="card-stats">
            <span class="stat stat-views">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
              <span class="stat-views-num">${formatCount(a.views_count)}</span>
            </span>
            <span class="stat stat-likes">
              <svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10.2-9.3C.2 8.8 1.6 5 5.3 4.2c2-.4 3.9.4 5.1 2.1l1.6 2.2 1.6-2.2c1.2-1.7 3.1-2.5 5.1-2.1 3.7.8 5.1 4.6 3.5 7.5C19.5 16.4 12 21 12 21z"/></svg>
              <span class="stat-likes-num">${formatCount(a.likes_count)}</span>
            </span>
            <button type="button" class="stat-share" aria-label="Share this article" data-idx="${idx}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>
            </button>
          </div>
          <div class="card-meta">${escapeHtml(formatAgo(a.published_at || a.created_at))}</div>
        </div>
      </a>`;
  }

  function renderBatch(articles) {
    const startIdx = grid.children.length;
    const frag = document.createElement("div");
    frag.innerHTML = articles.map((a, i) => cardHtml(a, startIdx + i)).join("");
    Array.from(frag.children).forEach((cardEl, i) => {
      const a = articles[i];
      const shareBtn = cardEl.querySelector(".stat-share");
      wireShareButton(shareBtn, a);
      grid.appendChild(cardEl);
    });
  }

  async function loadPage() {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading…";
    try {
      let query = client
        .from("news_articles")
        .select("slug, headline, dek, category, photo_url, published_at, created_at, views_count, likes_count")
        .eq("status", "published")
        .neq("visibility", "unlisted")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (cat) query = query.ilike("category", cat);

      const { data, error } = await query;
      if (error) throw error;

      if (offset === 0 && (!data || data.length === 0)) {
        grid.innerHTML = `<div class="empty-state">No ${cat ? escapeHtml(cat.toLowerCase()) + " " : ""}articles yet — check back soon, or <a href="../index.html">browse the homepage</a>.</div>`;
        loadMoreWrap.style.display = "none";
        return;
      }

      renderBatch(data || []);
      offset += data.length;

      if (!data || data.length < PAGE_SIZE) {
        loadMoreWrap.style.display = "none";
      } else {
        loadMoreWrap.style.display = "";
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "Load more";
      }
    } catch (err) {
      console.warn("Gakoro Media TV: could not load category articles.", err);
      if (offset === 0) {
        grid.innerHTML = `<div class="empty-state">Couldn't load articles right now. <a href="../index.html">Back to homepage</a></div>`;
      }
      loadMoreWrap.style.display = "none";
    }
  }

  function init() {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    loadPage();
    loadMoreBtn.addEventListener("click", loadPage);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
