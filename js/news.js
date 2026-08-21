/* =====================================================
   GAKORO MEDIA TV — breaking news ticker.

   Replaces the static ticker headlines on index.html with
   real published articles marked breaking=true, each one
   linking to article.html?slug=... so a click opens the full
   report (photo + report box), right here on the site.

   If Supabase isn't configured, the fetch fails, or there are
   no breaking articles yet, the ticker quietly keeps whatever
   static placeholder headlines are already in the markup —
   same fallback pattern as js/youtube.js.
===================================================== */
(function () {
  const track = document.querySelector(".ticker-track");
  if (!track) return;

  /* ---------- SPEED ----------
     Fixed-duration scrolling means more headlines = less time per
     headline, but the ticker never speeds up to compensate, so late
     items get scrolled past before anyone reads them.

     Instead we give each headline ~3.5s of "reading time", but cap
     the total loop at 35s so a big batch of breaking news speeds up
     rather than dragging the whole loop out. A floor of 18s keeps a
     short list (2-3 headlines) from flying by unreadably fast.

     Note: the DOM holds two copies of the list back-to-back (for the
     seamless -50% loop), so we divide the count in half first.       */
  function applyTickerSpeed() {
    const items = track.querySelectorAll(":scope > span, :scope > a").length;
    const headlineCount = Math.max(1, Math.round(items / 2));

    const SECONDS_PER_HEADLINE = 2.5;
    const MIN_DURATION = 14;
    const MAX_DURATION = 25;

    const duration = Math.min(
      MAX_DURATION,
      Math.max(MIN_DURATION, headlineCount * SECONDS_PER_HEADLINE)
    );

    track.style.setProperty("--ticker-duration", `${duration}s`);
  }

  // Set speed for whatever is in the markup right now (static
  // placeholder headlines), then again below once/if real data
  // replaces them.
  applyTickerSpeed();

  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase) return;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildSpan(article, hidden) {
    const a = document.createElement("a");
    a.href = `/article/?slug=${encodeURIComponent(article.slug)}`;
    a.style.color = "inherit";
    a.style.textDecoration = "none";
    if (hidden) a.setAttribute("aria-hidden", "true");
    const tag = (article.category || "GAKORO").toUpperCase();
    a.innerHTML = `${escapeHtml(tag)}: ${escapeHtml(article.headline)}`;
    return a;
  }

  async function init() {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await client
        .from("news_articles")
        .select("headline, slug, category")
        .eq("status", "published")
        .eq("breaking", true)
        .order("published_at", { ascending: false })
        .limit(12);

      if (error) throw error;
      if (!data || data.length === 0) return; // keep static placeholder ticker

      track.innerHTML = "";
      // Render the list twice back to back so the -50% scroll
      // animation loops seamlessly, same as the original markup.
      // The second copy is aria-hidden so screen readers don't
      // announce every headline twice.
      data.forEach((article) => track.appendChild(buildSpan(article, false)));
      data.forEach((article) => track.appendChild(buildSpan(article, true)));
      applyTickerSpeed();
    } catch (err) {
      console.warn("Gakoro Media TV: could not load breaking headlines, showing placeholder ticker.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
