/* =====================================================
   GAKORO MEDIA TV — pulls the real "Latest uploads" feed
   from the YouTube channel and fills the hero player plus
   the 3 side cards on index.html with real titles,
   thumbnails and stats.
   (The big grid below the hero now shows latest articles
   — see js/latest-articles.js.)

   The live player itself (js/live-player.js) already plays
   the channel's uploads playlist on its own, without needing
   this data. This script only makes the side cards clickable
   so tapping one swaps the player to that exact video —
   playback always stays on this page, never youtube.com. A
   small "YouTube ↗" icon on each card is the only way to
   leave the site, for anyone who explicitly wants to.

   Data comes from a Supabase Edge Function (get-youtube-videos)
   instead of calling the YouTube API directly — that keeps the
   YouTube API key on the server, never exposed in this file.
   Requires window.SUPABASE_URL and window.SUPABASE_ANON_KEY to
   be set in js/config.js (already used by the booking form).

   #heroSideVideos starts hidden with empty cards in the markup
   and only becomes visible once real uploads are fetched — no
   fake/placeholder video titles are ever shown.
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
    // The live player already autoplays the channel's uploads
    // playlist on load — this just refreshes the "now playing"
    // copy underneath it to match the latest real upload. It
    // deliberately never touches the iframe src so the stream
    // that's already rolling doesn't get interrupted.
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

  // The 3 cards in #heroSideVideos .side-card show the latest
  // uploads (besides the one already in the hero player). The
  // big grid further down the page now shows latest articles
  // instead — see js/latest-articles.js.
  function renderSideVideos(videos) {
    const section = document.getElementById("heroSideVideos");
    if (!section) return false;
    const cards = section.querySelectorAll(".side-card");
    let filled = 0;
    cards.forEach((card, idx) => {
      const v = videos[idx];
      if (!v) return; // fewer than 3 extra uploads — leave hidden
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
