/* =====================================================
   GAKORO MEDIA TV — latest articles grid.

   Fills the "Latest articles" cards below the hero
   (#articleGrid .card) with the most recently published
   rows from the Supabase `news_articles` table, each one
   linking to article/index.html?slug=... and showing its
   view count, like count, and a share button — same stats
   as the full article page (js/article.js), just compact.

   #articleGrid starts hidden in the markup and only becomes
   visible once real published articles are found — no
   fake/placeholder headlines are ever shown.
===================================================== */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  const section = document.getElementById("articleGrid");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    return; // not configured yet — keep section hidden
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
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

  // Same share target the full article page uses (js/article.js) —
  // a Cloudflare Worker Route on /share/* proxies it to Supabase for
  // rich link previews, falling back to the plain article page.
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
      // The whole card is a link to the article — the share button
      // sits inside it but must never trigger that navigation.
      e.preventDefault();
      e.stopPropagation();

      if (navigator.share) {
        try {
          await navigator.share({ title: a.headline, text: a.dek || a.headline, url });
        } catch (err) {
          if (err && err.name === "AbortError") return; // user cancelled the share sheet
          await copyFallback();
        }
      } else {
        await copyFallback();
      }
    });
  }

  function renderCards(articles) {
    const cards = document.querySelectorAll("#articleGrid .card");
    cards.forEach((card, idx) => {
      const a = articles[idx];
      if (!a) {
        card.style.display = "none"; // fewer than 8 published articles
        return;
      }
      card.href = `article/index.html?slug=${encodeURIComponent(a.slug)}`;

      const thumb = card.querySelector(".card-thumb");
      thumb.className = "card-thumb"; // drop the placeholder gradient class
      if (a.photo_url) {
        thumb.style.backgroundImage = `url('${a.photo_url}')`;
        thumb.style.backgroundSize = "cover";
        thumb.style.backgroundPosition = "center";
      } else {
        thumb.classList.add(`g${(idx % 8) + 1}`); // keep a gradient fallback
      }

      card.querySelector(".card-title").textContent = a.headline;
      const dek = card.querySelector(".card-dek");
      if (a.dek) {
        dek.textContent = a.dek;
        dek.style.display = "";
      } else {
        dek.style.display = "none";
      }

      card.querySelector(".stat-views-num").textContent = formatCount(a.views_count);
      card.querySelector(".stat-likes-num").textContent = formatCount(a.likes_count);
      wireShareButton(card.querySelector(".stat-share"), a);

      card.querySelector(".card-meta").innerHTML =
        `<span>${escapeHtml(a.category || "Latest")}</span><span>${formatAgo(a.published_at || a.created_at)}</span>`;
      card.setAttribute("aria-label", `Read "${a.headline}"`);
      card.style.display = "";
    });
  }

  async function init() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client
        .from("news_articles")
        .select("slug, headline, dek, category, photo_url, published_at, created_at, views_count, likes_count")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      if (!data || data.length === 0) return; // no published articles yet — keep section hidden

      renderCards(data);
      if (section) section.style.display = "";
    } catch (err) {
      console.warn("Gakoro Media TV: could not load latest articles, keeping grid hidden.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
