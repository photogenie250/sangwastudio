/* =====================================================
   GAKORO MEDIA TV — pulls the real "Latest uploads" feed
   from the YouTube channel and replaces the placeholder
   hero + grid cards on index.html.

   Data comes from a Supabase Edge Function (get-youtube-videos)
   instead of calling the YouTube API directly — that keeps the
   YouTube API key on the server, never exposed in this file.
   Requires window.SUPABASE_URL and window.SUPABASE_ANON_KEY to
   be set in js/config.js (already used by the booking form).

   If Supabase isn't configured, or the fetch fails, this script
   quietly leaves the existing static placeholder content in
   place — the page never breaks.
===================================================== */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.startsWith("https://")) {
    return; // not configured yet — keep placeholder content
  }

  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/get-youtube-videos?count=10`;

  async function getJSON(url) {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`get-youtube-videos error ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.videos || [];
  }

  function formatViews(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 >= 100_000 ? 1 : 0) + "M views";
    if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 >= 100 ? 1 : 0) + "K views";
    return n + " views";
  }

  function formatAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
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

  function formatDuration(iso) {
    // ISO 8601, e.g. PT14M20S / PT1H2M3S
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = parseInt(m[1] || "0", 10);
    const min = parseInt(m[2] || "0", 10);
    const s = parseInt(m[3] || "0", 10);
    const totalMin = h * 60 + min;
    return h > 0
      ? `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${totalMin}:${String(s).padStart(2, "0")}`;
  }

  async function fetchLatestVideos(count) {
    const raw = await getJSON(FUNCTION_URL);
    return raw.slice(0, count).map((v) => ({
      id: v.id,
      title: v.title,
      thumb: v.thumb,
      views: formatViews(v.viewCount),
      ago: formatAgo(v.publishedAt),
      duration: formatDuration(v.duration),
      url: v.url,
    }));
  }

  function renderHero(v) {
    const hero = document.getElementById("heroSection");
    if (!hero || !v) return;
    const inner = hero.querySelector(":scope > div");
    const main = hero.querySelector(".hero-thumb");
    if (main) {
      main.style.backgroundImage = `url('${v.thumb}')`;
      main.style.backgroundSize = "cover";
      main.style.backgroundPosition = "center";
      main.querySelector(".duration-badge").textContent = v.duration;
    }
    const headline = hero.querySelector(".hero-headline");
    if (headline) headline.textContent = v.title;
    const dek = hero.querySelector(".hero-dek");
    if (dek) dek.style.display = "none";
    const byline = hero.querySelector(".byline");
    if (byline) {
      byline.innerHTML = `GAKORO MEDIA TV <span class="sep">&bull;</span> ${v.views} <span class="sep">&bull;</span> ${v.ago}`;
    }
    if (inner) {
      const wrap = document.createElement("a");
      wrap.href = v.url;
      wrap.target = "_blank";
      wrap.rel = "noopener";
      wrap.style.display = "contents";
      inner.parentNode.insertBefore(wrap, inner);
      wrap.appendChild(inner);
    }
  }

  function renderSideCards(videos) {
    const cards = document.querySelectorAll("#heroSection .side-card");
    cards.forEach((card, idx) => {
      const v = videos[idx];
      if (!v) return;
      const a = document.createElement("a");
      a.href = v.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.style.display = "contents";
      const thumb = card.querySelector(".side-thumb");
      thumb.style.backgroundImage = `url('${v.thumb}')`;
      thumb.style.backgroundSize = "cover";
      thumb.style.backgroundPosition = "center";
      thumb.querySelector(".duration-badge").textContent = v.duration;
      card.querySelector(".side-title").textContent = v.title;
      card.querySelector(".side-meta").innerHTML = `${v.ago}`;
      card.parentNode.insertBefore(a, card);
      a.appendChild(card);
    });
  }

  function renderGrid(videos) {
    const grid = document.getElementById("videoGrid");
    if (!grid) return;
    const cards = grid.querySelectorAll(".card");
    cards.forEach((card, idx) => {
      const v = videos[idx];
      if (!v) return;
      const thumb = card.querySelector(".card-thumb");
      thumb.className = "card-thumb"; // drop the old gN gradient class
      thumb.style.backgroundImage = `url('${v.thumb}')`;
      thumb.style.backgroundSize = "cover";
      thumb.style.backgroundPosition = "center";
      thumb.querySelector(".duration-badge").textContent = v.duration;
      card.querySelector(".card-title").textContent = v.title;
      const dek = card.querySelector(".card-dek");
      if (dek) dek.style.display = "none";
      card.querySelector(".card-meta").innerHTML = `<span>${v.views}</span><span>${v.ago}</span>`;

      const a = document.createElement("a");
      a.href = v.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.style.display = "contents";
      card.parentNode.insertBefore(a, card);
      a.appendChild(card);
    });
  }

  async function init() {
    try {
      // hero (1) + 3 side cards + 6 grid cards = 10
      const videos = await fetchLatestVideos(10);
      renderHero(videos[0]);
      renderSideCards(videos.slice(1, 4));
      renderGrid(videos.slice(4, 10));
    } catch (err) {
      console.warn("Gakoro Media TV: could not load YouTube feed, showing placeholder content.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
