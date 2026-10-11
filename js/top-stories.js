/* Homepage hero. The newest published article is the lead story
   (#featureStory), the next four fill #topStories. Both stay hidden until
   real articles load. */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
  const featureEl = document.getElementById("featureStory");
  const topStoriesEl = document.getElementById("topStories");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) {
    return; // not configured, keep sections hidden
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

  function renderFeature(a) {
    if (!featureEl || !a) return;
    featureEl.href = `article/?slug=${encodeURIComponent(a.slug)}`;
    const media = featureEl.querySelector(".feature-media");
    if (a.photo_url) {
      media.style.backgroundImage = `url('${a.photo_url}')`;
    } else {
      media.classList.add("g1");
    }
    const catEl = featureEl.querySelector("#featureCat");
    if (catEl) catEl.textContent = (a.category || "News").toUpperCase();
    const headlineEl = featureEl.querySelector("#featureHeadline");
    if (headlineEl) headlineEl.textContent = a.headline;
    const bylineEl = featureEl.querySelector("#featureByline");
    if (bylineEl) {
      bylineEl.innerHTML =
        `GAKORO MEDIA TV <span class="sep">&bull;</span> ${formatAgo(a.published_at || a.created_at)}`;
    }
    featureEl.setAttribute("aria-label", `Read "${escapeHtml(a.headline)}"`);
    featureEl.style.display = "";
  }

  function renderTopStories(articles) {
    if (!topStoriesEl) return;
    const items = topStoriesEl.querySelectorAll(".top-story-item");
    let filled = 0;
    items.forEach((item, idx) => {
      const a = articles[idx];
      if (!a) {
        item.style.display = "none";
        return;
      }
      item.href = `article/?slug=${encodeURIComponent(a.slug)}`;

      const thumb = item.querySelector(".ts-thumb");
      thumb.className = "ts-thumb";
      if (a.photo_url) {
        thumb.style.backgroundImage = `url('${(window.gakoroThumb || String)(a.photo_url)}')`;
        thumb.style.backgroundSize = "cover";
        thumb.style.backgroundPosition = "center";
      } else {
        thumb.classList.add(`g${(idx % 8) + 1}`);
      }

      item.querySelector(".ts-cat").textContent = (a.category || "News").toUpperCase();
      item.querySelector(".ts-title").textContent = a.headline;
      item.querySelector(".ts-meta").textContent = formatAgo(a.published_at || a.created_at);
      item.setAttribute("aria-label", `Read "${escapeHtml(a.headline)}"`);
      item.style.display = "";
      filled++;
    });
    if (filled > 0) topStoriesEl.style.display = "";
  }

  async function init() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client
        .from("news_articles")
        .select("slug, headline, category, photo_url, published_at, created_at")
        .eq("status", "published")
        .neq("visibility", "unlisted")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      if (!data || data.length === 0) return; // no published articles, keep hero hidden

      renderFeature(data[0]);
      renderTopStories(data.slice(1, 5));
    } catch (err) {
      console.warn("Gakoro Media TV: could not load homepage articles, keeping hero hidden.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
