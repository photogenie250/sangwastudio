/* Fills the "now playing" text and the 3 side cards from the channel's
   latest uploads. Data comes from the get-youtube-videos edge function so
   the API key stays on the server. Needs SUPABASE_URL and
   SUPABASE_ANON_KEY from config.js. Cards stay hidden until real uploads
   load. (live-player.js plays the videos, latest-articles.js does the grid.) */
(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_URL.startsWith("https://")) {
    return; // not configured, keep placeholder content
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

  function addWatchExternalIcon(container, v) {
    const a = document.createElement("a");
    a.className = "watch-ext";
    a.href = v.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", `Open "${v.title}" on YouTube in a new tab`);
    a.textContent = "YouTube ↗";
    // Don't let the external link also trigger the in-page player.
    a.addEventListener("click", (e) => e.stopPropagation());
    container.appendChild(a);
  }

  function makePlayable(el, v) {
    el.setAttribute("data-video-id", v.id);
    el.setAttribute("data-video-title", v.title);
    el.setAttribute("data-video-views", v.views);
    el.setAttribute("data-video-ago", v.ago);
    if (window.gakoroWireUpPlayable) window.gakoroWireUpPlayable(el);
  }

  function renderHero(v) {
    // the live player already autoplays the uploads playlist; this only
    // updates the "now playing" text and never touches the iframe src, so
    // the stream isn't interrupted
    const hero = document.getElementById("heroSection");
    if (!hero || !v) return;
    const headline = document.getElementById("nowPlayingTitle");
    if (headline) headline.textContent = v.title;
    const dek = document.getElementById("nowPlayingDek");
    if (dek) dek.style.display = "none";
    const byline = document.getElementById("nowPlayingByline");
    if (byline) {
      byline.innerHTML = `GAKORO MEDIA TV <span class="sep">&bull;</span> ${v.views} <span class="sep">&bull;</span> ${v.ago}`;
    }
  }

  // the 3 .side-card items in #heroSideVideos show the latest uploads
  // (the grid further down shows articles, see latest-articles.js)
  function renderSideVideos(videos) {
    const section = document.getElementById("heroSideVideos");
    if (!section) return false;
    const cards = section.querySelectorAll(".side-card");
    let filled = 0;
    cards.forEach((card, idx) => {
      const v = videos[idx];
      if (!v) return; // fewer than 3 extra uploads, leave hidden
      const thumb = card.querySelector(".side-thumb");
      thumb.className = "side-thumb"; // drop the placeholder gradient class
      thumb.style.backgroundImage = `url('${v.thumb}')`;
      thumb.style.backgroundSize = "cover";
      thumb.style.backgroundPosition = "center";
      thumb.querySelector(".duration-badge").textContent = v.duration;
      addWatchExternalIcon(thumb, v);
      card.querySelector(".side-title").textContent = v.title;
      card.querySelector(".side-meta").innerHTML = `${v.views} <span class="sep">&bull;</span> ${v.ago}`;
      card.setAttribute("aria-label", `Play "${v.title}"`);
      makePlayable(card, v);
      filled++;
    });
    if (filled > 0) section.style.display = "";
    return filled > 0;
  }

  async function init() {
    try {
      // hero (1) + 3 side cards = 4
      const videos = await fetchLatestVideos(4);
      renderHero(videos[0]);
      renderSideVideos(videos.slice(1, 4));
    } catch (err) {
      console.warn("Gakoro Media TV: could not load YouTube feed, keeping video cards hidden.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
