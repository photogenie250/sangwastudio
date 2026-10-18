/* Breaking news ticker. Lists published articles with breaking=true, each
   linking to article/?slug=. #tickerBar stays hidden until real headlines
   load. */
(function () {
  const bar = document.getElementById("tickerBar");
  const track = document.querySelector(".ticker-track");
  if (!track) return;

  /* Ticker speed: about 3.5s per headline, capped at 35s for the whole
     loop and never under 18s. The list is in the DOM twice (for the
     seamless -50% loop), so the count is halved first. */
  function applyTickerSpeed() {
    const items = track.querySelectorAll(":scope > span, :scope > a").length;
    const headlineCount = Math.max(1, Math.round(items / 2));

    // mobile shows less of the track at once, so give each headline more time
    const isNarrow = window.innerWidth <= 640;
    const SECONDS_PER_HEADLINE = isNarrow ? 4.5 : 2.5;
    const MIN_DURATION = isNarrow ? 22 : 14;
    const MAX_DURATION = isNarrow ? 38 : 25;

    const duration = Math.min(
      MAX_DURATION,
      Math.max(MIN_DURATION, headlineCount * SECONDS_PER_HEADLINE)
    );

    track.style.setProperty("--ticker-duration", `${duration}s`);
  }

  // set the speed for the current markup, and again when real data replaces it
  applyTickerSpeed();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyTickerSpeed, 200);
  });

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
        .neq("visibility", "unlisted")
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .limit(12);

      if (error) throw error;
      if (!data || data.length === 0) return; // no breaking headlines, keep ticker hidden

      track.innerHTML = "";
      // render the list twice so the -50% scroll loops seamlessly; the second
      // copy is aria-hidden so screen readers don't read every headline twice
      data.forEach((article) => track.appendChild(buildSpan(article, false)));
      data.forEach((article) => track.appendChild(buildSpan(article, true)));
      applyTickerSpeed();
      if (bar) bar.style.display = "";
    } catch (err) {
      console.warn("Gakoro Media TV: could not load breaking headlines, keeping ticker hidden.", err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
