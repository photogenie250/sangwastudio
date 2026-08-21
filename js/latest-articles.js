/* =====================================================
   GAKORO MEDIA TV — latest articles side cards.

   Replaces the 3 placeholder cards beside the live player
   (#latestArticlesSide .side-card) with the 3 most recently
   published rows from the Supabase `news_articles` table,
   each one linking to article/index.html?slug=... .

   If Supabase isn't configured, the fetch fails, or there
   aren't at least a few published articles yet, this script
   quietly leaves the static placeholder cards in place —
   same fallback pattern as js/youtube.js and js/news.js.
===================================================== */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    return; // not configured yet — keep placeholder content
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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

  function renderCards(articles) {
    const cards = document.querySelectorAll("#latestArticlesSide .side-card");
    cards.forEach((card, idx) => {
      const a = articles[idx];
      if (!a) {
        card.style.display = "none"; // fewer than 3 published articles
        return;
      }
      card.href = `article/index.html?slug=${encodeURIComponent(a.slug)}`;

      const thumb = card.querySelector(".side-thumb");
      thumb.className = "side-thumb"; // drop the placeholder gradient class
      if (a.photo_url) {
        thumb.style.backgroundImage = `url('${a.photo_url}')`;
        thumb.style.backgroundSize = "cover";
        thumb.style.backgroundPosition = "center";
      }

      card.querySelector(".side-title").textContent = a.headline;
      card.querySelector(".side-meta").innerHTML =
        `${escapeHtml(a.category || "Latest")} <span class="sep">&bull;</span> ${formatAgo(a.published_at || a.created_at)}`;
      card.setAttribute("aria-label", `Read "${a.headline}"`);
    });
  }

  async function init() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client
        .from("news_articles")
        .select("slug, headline, category, photo_url, published_at, created_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      if (!data || data.length === 0) return; // keep static placeholder cards

      renderCards(data);
    } catch (err) {
      console.warn("Gakoro Media TV: could not load latest articles, showing placeholder cards.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
